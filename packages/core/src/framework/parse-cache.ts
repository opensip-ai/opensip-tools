// @fitness-ignore-file toctou-race-condition -- synchronous Map.get/set in single-threaded Node.js runtime; no async gap between read and write
/**
 * @fileoverview Shared AST parse cache for fitness checks
 *
 * Provides a module-level parse cache that eliminates redundant
 * ts.createSourceFile() calls when multiple AST-based checks
 * analyze the same file. Managed by FitnessRecipeService lifecycle.
 */

import ts from 'typescript'

// =============================================================================
// PARSE CACHE
// =============================================================================

class ParseCache {
  private cache = new Map<string, ts.SourceFile>()

  getOrParse(filePath: string, content: string): ts.SourceFile | null {
    // Cache key uses a fast content fingerprint to differentiate between raw
    // content and code-only filtered content. content.length alone is insufficient
    // because filterContent preserves length (replaces chars with same-length spaces).
    // Using the first 64 chars + length provides practical uniqueness.
    const fingerprint = content.slice(0, 64).replace(/\s/g, '') + ':' + content.length
    const cacheKey = `${filePath}:${fingerprint}`
    const cached = this.cache.get(cacheKey)
    if (cached) return cached

    try {
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true,  // setParentNodes — needed for walkNodes
        ts.ScriptKind.TSX,  // Handle both .ts and .tsx
      )
      this.cache.set(cacheKey, sourceFile)
      return sourceFile
    } catch {
      // @swallow-ok Parse failure returns null (matches parseSource() behavior)
      return null
    }
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }
}

// Module-level singleton, set by FitnessRecipeService before checks run
let activeCache: ParseCache | null = null
let autoClearTimer: ReturnType<typeof setTimeout> | null = null

/** Called by FitnessRecipeService.start() before check execution */
export function initParseCache(): void {
  activeCache = new ParseCache()
  if (autoClearTimer) clearTimeout(autoClearTimer)
  autoClearTimer = setTimeout(() => {
    if (activeCache) {
      activeCache.clear()
      activeCache = null
    }
  }, 10 * 60 * 1000) // 10 minutes
  autoClearTimer.unref()
}

/** Called by FitnessRecipeService after check execution completes */
export function clearParseCache(): void {
  activeCache?.clear()
  activeCache = null
  if (autoClearTimer) {
    clearTimeout(autoClearTimer)
    autoClearTimer = null
  }
}

/**
 * Get or create a parsed TypeScript SourceFile.
 * Falls back to direct parse if no cache is active (e.g., running a single check).
 * Returns null on parse failure (matches parseSource() from ast-utilities.ts).
 */
export function getSharedSourceFile(filePath: string, content: string): ts.SourceFile | null {
  if (activeCache) {
    return activeCache.getOrParse(filePath, content)
  }
  // No active cache — parse directly (single-check mode)
  try {
    return ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  } catch {
    // @swallow-ok Graceful degradation on parse failure
    return null
  }
}
