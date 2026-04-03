/**
 * @fileoverview DevTools LineHeight Token Usage Check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/devtools/lineheight-token-usage
 * @version 1.0.0
 *
 * Enforces usage of theme.lineHeights tokens instead of hardcoded numeric
 * lineHeight values in the DevTools portal.
 *
 * Theme lineHeight tokens (from theme-variants.ts):
 * - none: 1
 * - snug: 1.2
 * - tight: 1.25
 * - base: 1.4
 * - normal: 1.5
 * - loose: 1.6
 * - relaxed: 1.75
 */

import { defineCheck, type CheckViolation } from '@opensip-tools/core'

// =============================================================================
// CONSTANTS
// =============================================================================

/** Files/directories to exclude from checking */
const EXCLUDED_PATTERNS = [
  /\/theme\//, // Theme definition files themselves
  /\/styles\//, // Style definition files
]

/** Mapping from lineHeight value to theme token */
const LINE_HEIGHT_TOKEN_MAP: Record<string, string> = {
  '1': 'theme.lineHeights.none',
  '1.0': 'theme.lineHeights.none',
  '1.2': 'theme.lineHeights.snug',
  '1.25': 'theme.lineHeights.tight',
  '1.4': 'theme.lineHeights.base',
  '1.5': 'theme.lineHeights.normal',
  '1.6': 'theme.lineHeights.loose',
  '1.75': 'theme.lineHeights.relaxed',
}

// =============================================================================
// DETECTION
// =============================================================================

/**
 * Detect hardcoded lineHeight values that should use theme tokens.
 */
function detectHardcodedLineHeights(lines: string[]): CheckViolation[] {
  const violations: CheckViolation[] = []
  const lineHeightPattern = /lineHeight:\s*(\d+\.?\d*)/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()

    // Skip comments and imports
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('import ')) {
      continue
    }

    // Skip lines already using theme tokens
    if (line.includes('theme.lineHeights')) continue

    // Skip string values like lineHeight: 'inherit' or lineHeight: 'normal'
    if (/lineHeight:\s*['"]/.test(line)) continue

    const match = lineHeightPattern.exec(line)
    if (match?.[1]) {
      const value = match[1]
      const tokenSuggestion = LINE_HEIGHT_TOKEN_MAP[value]
      const suggestion = tokenSuggestion
        ? `Replace lineHeight: ${value} with ${tokenSuggestion}`
        : `lineHeight: ${value} is not a standard token — use the nearest theme.lineHeights.* value`

      violations.push({
        type: 'hardcoded-line-height',
        line: i + 1,
        message: `Hardcoded lineHeight: ${value} — use theme.lineHeights.*`,
        severity: 'warning',
        suggestion,
        match: trimmed.slice(0, 120),
      })
    }
  }

  return violations
}

// =============================================================================
// ANALYSIS FUNCTION
// =============================================================================

function analyzeFile(content: string, filePath: string): CheckViolation[] {
  if (EXCLUDED_PATTERNS.some((p) => p.test(filePath))) {
    return []
  }

  const lines = content.split('\n')
  return detectHardcodedLineHeights(lines)
}

// =============================================================================
// CHECK DEFINITION
// =============================================================================

export const lineheightTokenUsage = defineCheck({
  id: 'da034993-7415-41ee-aafd-1b590dde91a6',
  slug: 'lineheight-token-usage',
  disabled: true,
  scope: { languages: ['typescript', 'tsx'], concerns: ['frontend', 'ui'] },
  contentFilter: 'code-only',

  confidence: 'medium',
  description: 'Enforces theme.lineHeights tokens instead of hardcoded numeric lineHeight values',
  longDescription: `**Purpose:** Enforces usage of \`theme.lineHeights.*\` tokens instead of hardcoded numeric lineHeight values.

**Detects:**
- \`lineHeight: <number>\` patterns where the value is a raw numeric literal (e.g., \`lineHeight: 1.5\`)
- Skips lines already using \`theme.lineHeights\` and string values like \`lineHeight: 'inherit'\`
- Maps known values to tokens: none(1), snug(1.2), tight(1.25), base(1.4), normal(1.5), loose(1.6), relaxed(1.75)

**Why it matters:** Hardcoded lineHeight values bypass the theme system, making it impossible to adjust typography scale globally and creating visual inconsistency.

**Scope:** Codebase-specific convention. Analyzes each file individually.`,
  tags: ['quality', 'devtools', 'ui', 'theming', 'consistency', 'tokens'],
  fileTypes: ['ts', 'tsx'],

  analyze: analyzeFile,
})
