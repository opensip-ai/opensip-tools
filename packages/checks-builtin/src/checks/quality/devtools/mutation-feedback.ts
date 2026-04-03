// @fitness-ignore-file no-console-log -- Check definition references console methods in its description
/**
 * @fileoverview Mutation Feedback Check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/devtools/mutation-feedback
 * @version 1.0.0
 *
 * Detects catch blocks around API calls that log errors but never surface
 * feedback to the user. When a mutation fails, users should see a toast,
 * notification, or other UI feedback — not just a console/reportApiError log.
 *
 * Note: No toast system exists yet in the DevTools portal. This check
 * surfaces the gap so that once a toast system is implemented, these
 * catch blocks can be updated.
 */

import { defineCheck, type CheckViolation } from '@opensip-tools/core'

// =============================================================================
// CONSTANTS
// =============================================================================

/** Patterns that indicate error logging without user feedback */
const ERROR_LOGGING_PATTERNS = [/reportApiError\s*\(/, /console\.error\s*\(/, /console\.warn\s*\(/]

/** Patterns that indicate user-facing feedback IS present */
const USER_FEEDBACK_PATTERNS = [
  /toast\s*[.(]/i,
  /notify\s*\(/i,
  /notification\s*[.(]/i,
  /showToast\s*\(/,
  /addToast\s*\(/,
  /showNotification\s*\(/,
  /showError\s*\(/,
  /showSuccess\s*\(/,
  /setError\s*\(/,
  /setErrorMessage\s*\(/,
  /alert\s*\(/,
]

// =============================================================================
// DETECTION HELPERS
// =============================================================================

/** Extract the catch block body text starting from the catch line. */
function extractCatchBlockText(lines: string[], startIndex: number): string {
  const catchBlockLines: string[] = []
  let braceDepth = 0
  let inBlock = false

  for (let j = startIndex; j < Math.min(lines.length, startIndex + 25); j++) {
    const blockLine = lines[j] ?? ''
    catchBlockLines.push(blockLine)

    for (const char of blockLine) {
      if (char === '{') {
        braceDepth++
        inBlock = true
      }
      if (char === '}') braceDepth--
    }

    if (inBlock && braceDepth <= 0) break
  }

  return catchBlockLines.join('\n')
}

/** Check if text contains any error logging patterns. */
function containsErrorLogging(text: string): boolean {
  return ERROR_LOGGING_PATTERNS.some((p) => p.test(text))
}

/** Check if text contains any user feedback patterns. */
function containsUserFeedback(text: string): boolean {
  return USER_FEEDBACK_PATTERNS.some((p) => p.test(text))
}

// =============================================================================
// DETECTION
// =============================================================================

/**
 * Analyze a file for catch blocks that silently swallow errors.
 *
 * Strategy: Find `catch` blocks, then check if they contain error logging
 * without any user feedback mechanism.
 */
function analyzeFile(content: string, _filePath: string): CheckViolation[] {
  const violations: CheckViolation[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()

    // Skip comments
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue

    // Look for catch blocks
    if (!/catch\s*\(/.test(trimmed) && !/\.catch\s*\(/.test(trimmed)) continue

    const catchBlockText = extractCatchBlockText(lines, i)
    if (!containsErrorLogging(catchBlockText)) continue
    if (containsUserFeedback(catchBlockText)) continue

    violations.push({
      type: 'silent-error-catch',
      line: i + 1,
      message: 'Catch block logs error but does not surface feedback to the user',
      severity: 'warning',
      suggestion:
        'Add a toast notification or UI error state so the user knows the operation failed. ' +
        'Example: toast.error("Failed to save changes. Please try again.")',
      match: trimmed.slice(0, 120),
    })
  }

  return violations
}

// =============================================================================
// CHECK DEFINITION
// =============================================================================

/**
 * Check: quality/mutation-feedback
 *
 * Ensures catch blocks surface errors to the user, not just log them.
 */
export const mutationFeedback = defineCheck({
  id: '591803c9-95f9-4546-9e61-dcf1429d5e1d',
  slug: 'mutation-feedback',
  disabled: true,
  scope: { languages: ['typescript', 'tsx'], concerns: ['frontend', 'ui'] },
  contentFilter: 'code-only',

  confidence: 'medium',
  description:
    'Detects catch blocks that log errors without surfacing feedback to the user — suggests toast/notification',
  longDescription: `**Purpose:** Ensures catch blocks around API calls surface error feedback to users, not just log silently.

**Detects:**
- \`catch\` blocks containing error logging (\`reportApiError()\`, \`console.error()\`, \`console.warn()\`) but no user-facing feedback
- User feedback patterns checked: \`toast\`, \`notify\`, \`notification\`, \`showToast\`, \`addToast\`, \`showError\`, \`setError\`, \`setErrorMessage\`, \`alert\`, etc.

**Why it matters:** When mutations fail silently, users have no indication their action did not succeed, leading to data loss and confusion.

**Scope:** General best practice (UX quality). Analyzes each file individually.`,
  tags: ['quality', 'devtools', 'ux', 'error-handling', 'feedback'],
  fileTypes: ['ts', 'tsx'],

  analyze: analyzeFile,
})
