/**
 * @fileoverview DevTools zIndex Token Usage Check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/devtools/zindex-token-usage
 * @version 1.0.0
 *
 * Enforces usage of theme.zIndex tokens instead of hardcoded numeric
 * zIndex values in the DevTools portal.
 *
 * Theme zIndex tokens (from theme-variants.ts):
 * - dropdown: 100
 * - sticky: 200
 * - overlay: 300
 * - modal: 400
 * - popover: 500
 * - tooltip: 600
 * - toast: 700
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

/** Mapping from zIndex value to theme token */
const ZINDEX_TOKEN_MAP: Record<number, string> = {
  100: 'theme.zIndex.dropdown',
  200: 'theme.zIndex.sticky',
  300: 'theme.zIndex.overlay',
  400: 'theme.zIndex.modal',
  500: 'theme.zIndex.popover',
  600: 'theme.zIndex.tooltip',
  700: 'theme.zIndex.toast',
}

/** Get the nearest zIndex token for a given value */
function getNearestZIndexToken(value: number): string {
  const tokens: Array<[string, number]> = [
    ['dropdown', 100],
    ['sticky', 200],
    ['overlay', 300],
    ['modal', 400],
    ['popover', 500],
    ['tooltip', 600],
    ['toast', 700],
  ]
  let nearest: [string, number] = tokens[0] ?? ['dropdown', 100]
  let minDiff = Math.abs(value - nearest[1])
  for (const token of tokens) {
    const diff = Math.abs(value - token[1])
    if (diff < minDiff) {
      minDiff = diff
      nearest = token
    }
  }
  return nearest[0]
}

// =============================================================================
// DETECTION
// =============================================================================

/**
 * Detect hardcoded zIndex values that should use theme tokens.
 */
function detectHardcodedZIndex(lines: string[]): CheckViolation[] {
  const violations: CheckViolation[] = []
  const zIndexPattern = /zIndex:\s*(\d+)/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()

    // Skip comments and imports
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('import ')) {
      continue
    }

    // Skip lines already using theme tokens
    if (line.includes('theme.zIndex')) continue

    const match = zIndexPattern.exec(line)
    if (match?.[1]) {
      // @fitness-ignore-next-line numeric-validation -- regex capture group is digit-only (\d+)
      const value = parseInt(match[1], 10)

      // Skip zIndex: 0 or zIndex: 1 (legitimate inline values for stacking context)
      if (value <= 1) continue

      const tokenName = ZINDEX_TOKEN_MAP[value]
      if (tokenName) {
        violations.push({
          type: 'hardcoded-zindex',
          line: i + 1,
          message: `Hardcoded zIndex: ${value} — use ${tokenName}`,
          severity: 'warning',
          suggestion: `Replace with ${tokenName}`,
          match: trimmed.slice(0, 120),
        })
      } else {
        const nearest = getNearestZIndexToken(value)
        violations.push({
          type: 'hardcoded-zindex',
          line: i + 1,
          message: `Hardcoded zIndex: ${value} is not a theme token — use theme.zIndex.*`,
          severity: 'warning',
          suggestion: `Use the nearest theme zIndex token: theme.zIndex.${nearest}`,
          match: trimmed.slice(0, 120),
        })
      }
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
  return detectHardcodedZIndex(lines)
}

// =============================================================================
// CHECK DEFINITION
// =============================================================================

export const zindexTokenUsage = defineCheck({
  id: 'bef2b2b9-813d-4b70-98e6-ef42eb4253f1',
  slug: 'zindex-token-usage',
  disabled: true,
  scope: { languages: ['typescript', 'tsx'], concerns: ['frontend', 'ui'] },
  contentFilter: 'code-only',

  confidence: 'medium',
  description: 'Enforces theme.zIndex tokens instead of hardcoded numeric zIndex values',
  longDescription: `**Purpose:** Enforces usage of \`theme.zIndex.*\` tokens instead of hardcoded numeric zIndex values.

**Detects:**
- \`zIndex: <number>\` patterns where the value is a raw numeric literal greater than 1
- Maps known values to tokens: dropdown(100), sticky(200), overlay(300), modal(400), popover(500), tooltip(600), toast(700)
- Flags non-standard zIndex values and suggests the nearest theme token
- Skips lines already using \`theme.zIndex\` and theme/style definition files

**Why it matters:** Hardcoded zIndex values create stacking context conflicts and make it impossible to maintain a predictable layering system across the portal.

**Scope:** Codebase-specific convention. Analyzes each file individually.`,
  tags: ['quality', 'devtools', 'ui', 'theming', 'consistency', 'tokens'],
  fileTypes: ['ts', 'tsx'],

  analyze: analyzeFile,
})
