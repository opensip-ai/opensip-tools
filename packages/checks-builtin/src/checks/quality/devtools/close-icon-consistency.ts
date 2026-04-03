/**
 * @fileoverview DevTools Close Icon Consistency Check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/devtools/close-icon-consistency
 * @version 1.0.0
 *
 * Enforces usage of the CLOSE_ICON constant from @/theme instead of
 * hardcoded Unicode close/multiplication characters.
 *
 * The canonical close icon is U+2715 (MULTIPLICATION X), exported as
 * CLOSE_ICON from @/theme/helpers.
 *
 * Characters that should use CLOSE_ICON instead:
 * - \u00D7 (×) MULTIPLICATION SIGN
 * - \u2715 (✕) MULTIPLICATION X (correct char, but should use the constant)
 * - \u2573 (╳) BOX DRAWINGS LIGHT DIAGONAL CROSS
 * - \u2716 (✖) HEAVY MULTIPLICATION X
 */

import { defineCheck, type CheckViolation } from '@opensip-tools/core'

// =============================================================================
// CONSTANTS
// =============================================================================

/** Files/directories to exclude from checking */
const EXCLUDED_PATTERNS = [
  /\/theme\//, // Theme definition files (where CLOSE_ICON is defined)
]

/**
 * Close-like Unicode characters that should use the CLOSE_ICON constant.
 * Each entry maps a character pattern to its Unicode name for the message.
 */
const CLOSE_CHAR_PATTERNS: Array<{ pattern: RegExp; charName: string; codePoint: string }> = [
  { pattern: /\u00D7/, charName: 'MULTIPLICATION SIGN', codePoint: 'U+00D7' },
  { pattern: /\u2715/, charName: 'MULTIPLICATION X', codePoint: 'U+2715' },
  { pattern: /\u2573/, charName: 'BOX DRAWINGS LIGHT DIAGONAL CROSS', codePoint: 'U+2573' },
  { pattern: /\u2716/, charName: 'HEAVY MULTIPLICATION X', codePoint: 'U+2716' },
]

// =============================================================================
// DETECTION
// =============================================================================

/** Check if a line should be skipped (comments, imports, CLOSE_ICON references, close constant defs) */
function shouldSkipCloseIconLine(line: string, trimmed: string): boolean {
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('import ')) {
    return true
  }
  if (line.includes('CLOSE_ICON')) return true
  if (/const\s+\w*[Cc]lose\w*\s*=/.test(line)) return true
  return false
}

/** Find the first matching close character pattern on a line */
function findCloseCharMatch(line: string): { charName: string; codePoint: string } | null {
  for (const { pattern, charName, codePoint } of CLOSE_CHAR_PATTERNS) {
    if (pattern.test(line)) {
      return { charName, codePoint }
    }
  }
  return null
}

/**
 * Detect hardcoded close icon characters that should use the CLOSE_ICON constant.
 */
function detectHardcodedCloseIcons(lines: string[], hasCloseIconImport: boolean): CheckViolation[] {
  const violations: CheckViolation[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()

    if (shouldSkipCloseIconLine(line, trimmed)) continue

    const match = findCloseCharMatch(line)
    if (match) {
      violations.push({
        type: 'hardcoded-close-icon',
        line: i + 1,
        message: `Hardcoded close character ${match.codePoint} (${match.charName}) — use CLOSE_ICON from @/theme`,
        severity: 'warning',
        suggestion: hasCloseIconImport
          ? 'Replace the hardcoded character with the CLOSE_ICON constant'
          : "Add `import { CLOSE_ICON } from '@/theme'` and replace the hardcoded character",
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
  const hasCloseIconImport = content.includes('CLOSE_ICON')
  return detectHardcodedCloseIcons(lines, hasCloseIconImport)
}

// =============================================================================
// CHECK DEFINITION
// =============================================================================

export const closeIconConsistency = defineCheck({
  id: '07238f2e-026b-45b1-a945-77a546ba0830',
  slug: 'close-icon-consistency',
  disabled: true,
  scope: { languages: ['typescript', 'tsx'], concerns: ['frontend', 'ui'] },
  contentFilter: 'code-only',

  confidence: 'medium',
  description:
    'Enforces CLOSE_ICON constant from @/theme instead of hardcoded close/multiplication characters',
  longDescription: `**Purpose:** Enforces usage of the canonical \`CLOSE_ICON\` constant from \`@/theme\` instead of hardcoded Unicode close characters.

**Detects:**
- Hardcoded U+00D7 (MULTIPLICATION SIGN), U+2715 (MULTIPLICATION X), U+2573 (BOX DRAWINGS LIGHT DIAGONAL CROSS), U+2716 (HEAVY MULTIPLICATION X) in non-comment, non-import lines
- Skips lines already referencing \`CLOSE_ICON\` and theme definition files

**Why it matters:** Inconsistent close icon characters create visual inconsistency across the UI and make it harder to change the icon globally.

**Scope:** Codebase-specific convention. Analyzes each file individually.`,
  tags: ['quality', 'devtools', 'ui', 'icons', 'consistency'],
  fileTypes: ['ts', 'tsx'],

  analyze: analyzeFile,
})
