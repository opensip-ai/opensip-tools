/**
 * @fileoverview Empty State Quality Check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/devtools/empty-state-quality
 * @version 1.0.0
 *
 * Detects generic, low-quality empty state messages in the DevTools portal.
 * Empty states should be context-specific with a call to action, not generic
 * text like "No data." or "No results".
 */

import { defineCheck, type CheckViolation } from '@opensip-tools/core'

// =============================================================================
// CONSTANTS
// =============================================================================

/** Generic empty state patterns to flag */
const GENERIC_EMPTY_STATE_PATTERNS = [
  {
    regex: /['"`]No data\.?['"`]/i,
    suggestion:
      'Use a context-specific message, e.g. "No reconciliation sessions found. Run a session to see results here."',
  },
  {
    regex: /['"`]No results\.?['"`]/i,
    suggestion:
      'Use a context-specific message with guidance, e.g. "No matching tickets found. Try adjusting your filters."',
  },
  {
    regex: /['"`]No items\.?['"`]/i,
    suggestion: 'Use a context-specific message describing what can be created or configured here',
  },
  {
    regex: /['"`]Nothing to display\.?['"`]/i,
    suggestion:
      'Use a context-specific message explaining what will appear here and how to populate it',
  },
  {
    regex: /['"`]Nothing to show\.?['"`]/i,
    suggestion: 'Use a context-specific message with a call to action',
  },
  {
    regex: /['"`]No records\.?['"`]/i,
    suggestion:
      'Use a context-specific empty state that tells the user what records would appear here',
  },
  {
    regex: /['"`]Nothing found\.?['"`]/i,
    suggestion:
      'Use a context-specific message, e.g. "No findings matched your filters. Try broadening your search."',
  },
  {
    regex: /['"`]No entries\.?['"`]/i,
    suggestion:
      'Use a context-specific message describing what entries would appear and how to create them',
  },
]

// =============================================================================
// DETECTION
// =============================================================================

/**
 * Analyze a single file for generic empty state messages.
 */
function analyzeFile(content: string, _filePath: string): CheckViolation[] {
  const violations: CheckViolation[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()

    // Skip comments and imports
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('import ')) {
      continue
    }

    for (const { regex, suggestion } of GENERIC_EMPTY_STATE_PATTERNS) {
      if (regex.test(line)) {
        violations.push({
          type: 'generic-empty-state',
          line: i + 1,
          message: 'Generic empty state message — use context-specific text with a call to action',
          severity: 'warning',
          suggestion,
          match: trimmed.slice(0, 120),
        })
        break // Only report once per line
      }
    }
  }

  return violations
}

// =============================================================================
// CHECK DEFINITION
// =============================================================================

/**
 * Check: quality/empty-state-quality
 *
 * Enforces context-specific empty state messages in the DevTools portal.
 */
export const emptyStateQuality = defineCheck({
  id: 'd5769893-47d8-4c3e-ad2f-c18eeefc2082',
  slug: 'empty-state-quality',
  disabled: true,
  scope: { languages: ['typescript', 'tsx'], concerns: ['frontend', 'ui'] },
  contentFilter: 'code-only',

  confidence: 'medium',
  description:
    'Detects generic empty state messages — empty states should be context-specific with a call to action',
  longDescription: `**Purpose:** Ensures empty state messages are context-specific with actionable guidance, not generic placeholders.

**Detects:**
- String literals matching generic patterns: \`"No data"\`, \`"No results"\`, \`"No items"\`, \`"Nothing to display"\`, \`"Nothing to show"\`, \`"No records"\`, \`"Nothing found"\`, \`"No entries"\`
- Matches quoted strings (single, double, or backtick delimited), case-insensitive

**Why it matters:** Generic empty states like "No data" provide no guidance to users. Context-specific messages with calls to action improve UX by telling users what to expect and how to populate the view.

**Scope:** General best practice (UX quality). Analyzes each file individually.`,
  tags: ['devtools', 'ux', 'copy', 'quality'],
  fileTypes: ['ts', 'tsx'],

  analyze: analyzeFile,
})
