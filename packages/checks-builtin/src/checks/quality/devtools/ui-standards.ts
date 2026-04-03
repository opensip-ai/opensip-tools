// @fitness-ignore-file file-length-limits -- Complex module with tightly coupled logic; refactoring would risk breaking changes
/**
 * @fileoverview DevTools UI Standards Check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/devtools/ui-standards
 * @version 2.0.0
 *
 * Enforces UI standards specific to the DevTools portal:
 * - Early returns for loading/error states (not inline conditionals)
 * - maxWidth: 1200 detection (old standard should be 1400)
 * - useSemanticColors usage (no inline color logic for scores/rates/latencies)
 * - Section separator comments for files over 250 lines
 *
 * This check only applies to DevTools app page files.
 */

import { defineCheck, type CheckViolation } from '@opensip-tools/core'

// =============================================================================
// CONSTANTS
// =============================================================================

/** Files to exclude from checking */
const EXCLUDED_PATTERNS = [
  /\/templates\//, // Template files are reference implementations
  /\/demo\//,
  /\/examples\//,
]

/** Form page patterns - these pages have inline error displays which are valid */
const FORM_PAGE_PATTERNS = ['/new/page.tsx', '/edit/page.tsx']

/** Auth page patterns - different layout requirements */
const AUTH_PAGE_PATTERNS = [/\/\(auth\)\//, /\/auth\//]

/** Old maxWidth value that should be updated to 1400 */
const OLD_MAXWIDTH_VALUE = 1200

// =============================================================================
// VIOLATION TYPES
// =============================================================================

type ViolationType =
  | 'inline-loading'
  | 'inline-error'
  | 'wrong-maxwidth-dashboard'
  | 'inline-color-logic'
  | 'missing-section-separators'

// =============================================================================
// DETECTION HELPERS
// =============================================================================

/**
 * Detect inline loading conditionals that should be early returns
 * Pattern: {loading && (...)} or {isLoading && (...)}
 */
function detectInlineLoadingConditionals(lines: string[]): CheckViolation[] {
  const violations: CheckViolation[] = []
  const inlineLoadingPattern = /\{(?:loading|isLoading)\s*&&\s*\(/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue

    if (inlineLoadingPattern.test(line)) {
      violations.push({
        type: 'inline-loading' as ViolationType,
        line: i + 1,
        message: 'Inline loading conditional - use early return pattern instead',
        severity: 'warning',
        suggestion:
          'Move loading check before the main return: if (loading) { return <LoadingState /> }',
        match: line.trim(),
      })
    }
  }

  return violations
}

/**
 * Detect inline error conditionals that should be early returns
 * Pattern: {error && (...)}
 *
 * Note: Form pages (new/edit) and auth pages are excluded since they
 * legitimately display form validation, submission, or login errors inline.
 */
function detectInlineErrorConditionals(lines: string[], filePath: string): CheckViolation[] {
  // Skip form pages - they have inline error displays which are valid
  if (FORM_PAGE_PATTERNS.some((pattern) => filePath.endsWith(pattern))) {
    return []
  }
  // Skip auth pages - they show login errors inline
  if (AUTH_PAGE_PATTERNS.some((pattern) => pattern.test(filePath))) {
    return []
  }

  const violations: CheckViolation[] = []
  const inlineErrorPattern = /\{error\s*&&\s*\(/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue

    if (inlineErrorPattern.test(line)) {
      violations.push({
        type: 'inline-error' as ViolationType,
        line: i + 1,
        message: 'Inline error conditional - use early return pattern instead',
        severity: 'warning',
        suggestion: 'Move error check before the main return: if (error) { return <ErrorState /> }',
        match: line.trim(),
      })
    }
  }

  return violations
}

/**
 * Detect maxWidth issues
 *
 * Only flags the old standard maxWidth: 1200 which should be updated to 1400.
 * Other maxWidth values (for sidebars, cards, etc.) are not flagged to avoid
 * false positives.
 */
function detectMaxWidthIssues(lines: string[]): CheckViolation[] {
  const violations: CheckViolation[] = []
  const oldMaxWidthPattern = new RegExp(`maxWidth:\\s*${OLD_MAXWIDTH_VALUE}\\b`, 'g')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue

    if (oldMaxWidthPattern.test(line)) {
      violations.push({
        type: 'wrong-maxwidth-dashboard' as ViolationType,
        line: i + 1,
        message: `maxWidth: ${OLD_MAXWIDTH_VALUE} is the old standard - update to 1400 for dashboards`,
        severity: 'warning',
        suggestion: `Change maxWidth from ${OLD_MAXWIDTH_VALUE} to 1400`,
        match: `maxWidth: ${OLD_MAXWIDTH_VALUE}`,
      })
    }
    // Reset lastIndex for next line
    oldMaxWidthPattern.lastIndex = 0
  }

  return violations
}

/**
 * Detect inline color logic that should use useSemanticColors
 * Patterns like: score >= 90 ? colors.success : score >= 70 ? colors.warning : colors.error
 */
function detectInlineColorLogic(lines: string[]): CheckViolation[] {
  const violations: CheckViolation[] = []

  // Patterns that indicate inline color logic for scores/rates/latencies
  const inlineColorPatterns = [
    // Score-based color logic
    /(?:score|rate|percentage)\s*[><=]+\s*\d+\s*\?\s*(?:theme\.)?colors\./i,
    // Latency-based color logic
    /(?:latency|duration|time)(?:Ms)?\s*[><=]+\s*\d+\s*\?\s*(?:theme\.)?colors\./i,
    // Generic ternary with colors based on numeric comparison
    // eslint-disable-next-line sonarjs/slow-regex -- [^?]* bounded by ? delimiter; single-line match
    /\?\s*(?:theme\.)?colors\.(?:success|error|warning|info)\s*:\s*[^?]*\?\s*(?:theme\.)?colors\./,
  ]

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    // Skip comments and imports
    if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.includes('import '))
      continue

    for (const pattern of inlineColorPatterns) {
      if (pattern.test(line)) {
        violations.push({
          type: 'inline-color-logic' as ViolationType,
          line: i + 1,
          message: 'Inline color logic - use useSemanticColors() hook instead',
          severity: 'warning',
          suggestion:
            'Use getScoreIndicator(), getLatencyIndicator(), getPassRateIndicator(), etc. from useSemanticColors()',
          match: line.trim().slice(0, 100),
        })
        break // Only report once per line
      }
    }
  }

  return violations
}

/**
 * Check for section separator comments
 * Pattern: // ===== or // -----
 *
 * Only flags files over 250 lines without separators.
 * Auth pages are excluded as they have simpler layouts.
 */
function detectMissingSectionSeparators(lines: string[], filePath: string): CheckViolation[] {
  // Skip auth pages - they have simpler layouts
  if (AUTH_PAGE_PATTERNS.some((pattern) => pattern.test(filePath))) {
    return []
  }

  const violations: CheckViolation[] = []
  const separatorPattern = /\/\/\s*[=-]{10,}/

  const hasSeparators = lines.some((line) => separatorPattern.test(line))

  // Only flag if the file is substantial (>250 lines) and has no separators
  if (!hasSeparators && lines.length > 250) {
    violations.push({
      type: 'missing-section-separators' as ViolationType,
      line: 1,
      message: 'Missing section separator comments - add separators for code organization',
      severity: 'warning',
      suggestion: 'Add section separators like: // =========== SECTION NAME ===========',
    })
  }

  return violations
}

// =============================================================================
// ANALYSIS FUNCTION
// =============================================================================

/**
 * Analyze a single file for UI standard violations.
 */
function analyzeFile(content: string, filePath: string): CheckViolation[] {
  // Check if this is a page file
  const isPageFile = filePath.endsWith('/page.tsx')
  if (!isPageFile) {
    return []
  }

  // Check if this file should be excluded
  if (EXCLUDED_PATTERNS.some((p) => p.test(filePath))) {
    return []
  }

  const lines = content.split('\n')

  // Collect all violations
  const allViolations: CheckViolation[] = [
    ...detectInlineLoadingConditionals(lines),
    ...detectInlineErrorConditionals(lines, filePath),
    ...detectMaxWidthIssues(lines),
    ...detectInlineColorLogic(lines),
    ...detectMissingSectionSeparators(lines, filePath),
  ]

  return allViolations
}

// =============================================================================
// CHECK DEFINITION
// =============================================================================

/**
 * Check: quality/ui-standards
 *
 * Enforces UI standards for DevTools portal pages.
 */
export const devtoolsUiStandards = defineCheck({
  id: '6faf9d68-1c9e-40b6-b2b1-a8757cf1b01b',
  slug: 'ui-standards',
  disabled: true,
  scope: { languages: ['typescript', 'tsx'], concerns: ['frontend', 'ui'] },
  contentFilter: 'code-only',

  confidence: 'medium',
  description:
    'Enforces DevTools UI standards: early returns, maxWidth, useSemanticColors, section separators',
  longDescription: `**Purpose:** Enforces UI coding standards specific to DevTools portal page files.

**Detects:**
- Inline loading conditionals (\`{loading && (...)}\` or \`{isLoading && (...)}\`) instead of early return pattern
- Inline error conditionals (\`{error && (...)}\`) instead of early return pattern (excludes form/auth pages)
- Old \`maxWidth: 1200\` value that should be updated to 1400
- Inline color logic using ternaries with \`colors.success/error/warning\` for scores/rates/latencies instead of \`useSemanticColors()\`
- Files over 250 lines missing section separator comments (\`// ====\` or \`// ----\`)

**Why it matters:** Consistent page structure, standard layout widths, centralized color logic, and code organization improve maintainability and visual consistency across the portal.

**Scope:** Codebase-specific convention. Analyzes each file individually (page.tsx files only).`,
  tags: ['quality', 'devtools', 'ui', 'consistency', 'best-practices'],
  fileTypes: ['ts', 'tsx'],

  analyze: analyzeFile,
})
