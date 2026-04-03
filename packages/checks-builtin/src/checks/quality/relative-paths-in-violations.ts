// @fitness-ignore-file unused-config-options -- Config options reserved for future use or environment-specific
/**
 * @fileoverview Relative Paths in Violations Check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/relative-paths-in-violations
 * @version 2.0.0
 *
 * Enforces that fitness checks use relative paths (not basenames) when creating violations.
 * This ensures file locations in tickets are unambiguous and helpful for developers.
 */
// @fitness-ignore-file fitness-check-standards -- Uses custom scope object with include/exclude patterns

import { defineCheck, type CheckViolation } from '@opensip-tools/core'

/** Constant for path.basename literal used in pattern matching */
const PATH_BASENAME = 'path.basename'

/** Pre-compiled patterns for detecting basename usage instead of relative paths */
const PATTERNS = {
  /** Pattern 1: Variable assignment using basename for file field */
  constFileAssignment: new RegExp(String.raw`\b(const|let|var)\s+file\s*=\s*path\.basename\s*\(`),
  /** Pattern 2: Object property using basename for file field */
  fileProperty: new RegExp(String.raw`\bfile\s*:\s*path\.basename\s*\(`),
  /** Pattern 3: Object property using basename for name field */
  nameProperty: new RegExp(String.raw`\bname\s*:\s*path\.basename\s*\(`),
} as const

interface PatternMatch {
  pattern: RegExp
  message: string
  suggestion: string
}

/** Pattern definitions for violation detection */
const PATTERN_MATCHES: PatternMatch[] = [
  {
    pattern: PATTERNS.constFileAssignment,
    message: 'Use relative path instead of basename for violation file field',
    suggestion: 'Replace path.basename(filePath) with path.relative(ctx.cwd, filePath)',
  },
  {
    pattern: PATTERNS.fileProperty,
    message: 'Use relative path instead of basename for violation file field',
    suggestion: 'Replace path.basename(...) with path.relative(ctx.cwd, filePath)',
  },
  {
    pattern: PATTERNS.nameProperty,
    message: 'Use relative path instead of basename for violation name field',
    suggestion: 'Replace path.basename(...) with path.relative(ctx.cwd, filePath)',
  },
]

/**
 * Check a single line for path.basename violations.
 */
function checkLineForViolation(line: string, lineNum: number): CheckViolation | null {
  // Strip comments for analysis
  const commentIndex = line.indexOf('//')
  const effectiveLine = commentIndex !== -1 ? line.substring(0, commentIndex) : line

  // Skip if line doesn't contain path.basename
  if (!effectiveLine.includes(PATH_BASENAME)) {
    return null
  }

  // Check each pattern and return the first match
  for (const patternMatch of PATTERN_MATCHES) {
    if (patternMatch.pattern.test(effectiveLine)) {
      return {
        line: lineNum,
        column: effectiveLine.indexOf(PATH_BASENAME) + 1,
        message: patternMatch.message,
        severity: 'error',
        type: 'basename-in-violation',
        suggestion: patternMatch.suggestion,
        match: PATH_BASENAME,
      }
    }
  }

  return null
}

/**
 * Check: quality/relative-paths-in-violations
 *
 * Enforces that fitness checks use relative paths (not basenames) when creating violations.
 * This ensures file locations in tickets are unambiguous and helpful for developers.
 */
export const relativePathsInViolations = defineCheck({
  id: '5bed34a9-7182-4db2-a3a9-cf7a0babc8b8',
  slug: 'relative-paths-in-violations',
  scope: { languages: ['typescript'], concerns: ['backend', 'frontend', 'cli'] },
  contentFilter: 'code-only',

  confidence: 'medium',
  description: 'Enforce relative paths in violation file fields instead of basenames',
  longDescription: `**Purpose:** Enforces that fitness checks use relative paths instead of basenames when populating violation file fields, ensuring unambiguous file locations.

**Detects:**
- Variable assignment using basename for file field (e.g. const file = ...)
- Object property using basename for file field (e.g. file: ...)
- Object property using basename for name field (e.g. name: ...)
- Only flags path.basename usage in non-comment code

**Why it matters:** Basenames are ambiguous in a monorepo where multiple files share the same name. Relative paths (via \`path.relative(ctx.cwd, filePath)\`) provide unambiguous locations in tickets.

**Scope:** Codebase-specific convention. Analyzes each file individually (\`analyze\`). Targets \`cli/internal/devtools/fitness/src/checks/**/*.ts\`.`,
  tags: ['quality', 'fitness-framework', 'code-quality', 'violations'],
  fileTypes: ['ts'],

  analyze(content, _filePath): CheckViolation[] {
    // Quick filter: skip files without path.basename
    if (!content.includes(PATH_BASENAME)) {
      return []
    }

    const violations: CheckViolation[] = []
    const lines = content.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const violation = checkLineForViolation(lines[i] ?? '', i + 1)
      if (violation) {
        violations.push(violation)
      }
    }

    return violations
  },
})
