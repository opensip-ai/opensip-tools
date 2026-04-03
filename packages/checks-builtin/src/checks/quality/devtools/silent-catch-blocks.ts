/**
 * @fileoverview DevTools Silent Catch Block Detection
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/devtools/silent-catch-blocks
 * @version 1.0.0
 *
 * Detects empty or comment-only catch blocks that silently swallow errors.
 * All catch blocks should either:
 * - Report the error (addToast, reportError, console.error)
 * - Re-throw the error
 * - Explicitly handle the error with logic
 */

import { defineCheck, type CheckViolation } from '@opensip-tools/core'

// =============================================================================
// DETECTION
// =============================================================================

/** Build a silent catch block violation */
function buildSilentCatchViolation(
  catchLine: number,
  message: string,
  trimmed: string,
): CheckViolation {
  return {
    type: 'silent-catch-block',
    line: catchLine,
    message,
    severity: 'warning',
    suggestion:
      'Add error handling: report the error (addToast, reportError), re-throw it, or add a fitness-ignore comment explaining why it is safe to ignore',
    match: trimmed.slice(0, 120),
  }
}

/** Check if a line in a catch block body is a comment or empty */
function isCommentOrEmptyBodyLine(bodyLine: string): boolean {
  if (bodyLine === '' || bodyLine === '}') return true
  if (bodyLine.startsWith('//') || bodyLine.startsWith('/*') || bodyLine.startsWith('*')) {
    return true
  }
  return false
}

/** Scan a multi-line catch block to determine if it contains real code */
function catchBlockHasRealCode(lines: string[], startLine: number): boolean {
  let braceDepth = 1

  for (let j = startLine + 1; j < lines.length && braceDepth > 0; j++) {
    const bodyLine = (lines[j] ?? '').trim()

    // Track brace depth
    for (const ch of bodyLine) {
      if (ch === '{') braceDepth++
      if (ch === '}') braceDepth--
    }

    if (isCommentOrEmptyBodyLine(bodyLine)) continue

    // Found real code — this catch block is not silent
    return true
  }

  return false
}

/**
 * Detect empty or comment-only catch blocks.
 *
 * Scans for `catch (...)` followed by a block containing only whitespace,
 * comments, or nothing at all.
 */
function detectSilentCatches(lines: string[]): CheckViolation[] {
  const violations: CheckViolation[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()

    // Skip comment lines
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('import ')) {
      continue
    }

    // Detect catch block opening: `catch (e) {` or `catch {`
    // eslint-disable-next-line sonarjs/slow-regex -- \s* segments separated by literal '(' and ')'; no overlapping quantifiers
    if (!/catch\s*(?:\([^)]*\))?\s*\{/.test(trimmed)) continue

    // Find opening brace position
    const braceIdx = line.indexOf('{', line.indexOf('catch'))
    if (braceIdx === -1) continue

    const catchLine = i + 1 // 1-indexed

    // Check if the opening brace line also has the closing brace (single-line catch)
    const afterBrace = line.slice(braceIdx + 1).trim()
    if (afterBrace === '}') {
      violations.push(
        buildSilentCatchViolation(catchLine, 'Empty catch block silently swallows errors', trimmed),
      )
      continue
    }

    // Multi-line catch block — check if it has real code
    if (!catchBlockHasRealCode(lines, i)) {
      violations.push(
        buildSilentCatchViolation(
          catchLine,
          'Catch block contains only comments or is empty — errors are silently swallowed',
          trimmed,
        ),
      )
    }
  }

  return violations
}

// =============================================================================
// ANALYSIS FUNCTION
// =============================================================================

function analyzeFile(content: string): CheckViolation[] {
  const lines = content.split('\n')
  return detectSilentCatches(lines)
}

// =============================================================================
// CHECK DEFINITION
// =============================================================================

export const silentCatchBlocks = defineCheck({
  id: '5093dd22-11f0-4470-b009-79c8d80fb355',
  slug: 'silent-catch-blocks',
  disabled: true,
  scope: { languages: ['typescript', 'tsx'], concerns: ['frontend', 'ui'] },
  contentFilter: 'code-only',

  confidence: 'medium',
  description: 'Detects empty or comment-only catch blocks that silently swallow errors',
  longDescription: `**Purpose:** Detects catch blocks that silently swallow errors without any handling logic.

**Detects:**
- Completely empty catch blocks: \`catch (e) {}\`
- Catch blocks containing only comments or whitespace (no executable code)
- Matches both \`catch (...) {\` and \`catch {\` syntax

**Why it matters:** Silent catch blocks hide errors that may indicate real failures, making bugs invisible and debugging extremely difficult. Errors should be reported, re-thrown, or explicitly handled.

**Scope:** General best practice. Analyzes each file individually.`,
  tags: ['quality', 'devtools', 'error-handling', 'reliability'],
  fileTypes: ['ts', 'tsx'],

  analyze: analyzeFile,
})
