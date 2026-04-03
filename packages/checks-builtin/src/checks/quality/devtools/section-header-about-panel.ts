/**
 * @fileoverview Section Header AboutPanel Check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/devtools/section-header-about-panel
 * @version 1.0.0
 *
 * Detects h2/h3 section headers without an adjacent AboutPanel within ±10 lines
 * in DevTools pages. All section headers should have contextual documentation.
 */

import { defineCheck, type CheckViolation } from '@opensip-tools/core'

// =============================================================================
// CONSTANTS
// =============================================================================

/** Files excluded from this check (modals, forms) */
const EXCLUDED_FILE_PATTERNS = [
  /Modal[A-Z]?\S*\.tsx$/,
  /Modal\.tsx$/,
  /Create[A-Z]\S*\.tsx$/,
  /Edit[A-Z]\S*\.tsx$/,
]

/** Heading tags to detect */
const HEADING_REGEX = /<h[23][\s>]/

// =============================================================================
// DETECTION
// =============================================================================

/** Check if any line within ±10 lines of the given index contains 'AboutPanel' */
function hasAdjacentAboutPanel(lines: string[], lineIndex: number): boolean {
  const windowStart = Math.max(0, lineIndex - 10)
  const windowEnd = Math.min(lines.length - 1, lineIndex + 10)

  for (let j = windowStart; j <= windowEnd; j++) {
    if ((lines[j] ?? '').includes('AboutPanel')) {
      return true
    }
  }
  return false
}

function analyzeFile(content: string, filePath: string): CheckViolation[] {
  // Skip excluded file patterns
  if (EXCLUDED_FILE_PATTERNS.some((p) => p.test(filePath))) return []

  const violations: CheckViolation[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()

    // Skip comments and imports
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('import ')) {
      continue
    }

    if (!HEADING_REGEX.test(line)) continue

    if (!hasAdjacentAboutPanel(lines, i)) {
      violations.push({
        type: 'missing-about-panel',
        line: i + 1,
        message: 'Section header without adjacent AboutPanel — add contextual documentation',
        severity: 'warning',
        suggestion:
          'Add an <AboutPanel title="..."> sibling to provide contextual help for this section',
        match: trimmed.slice(0, 120),
      })
    }
  }

  return violations
}

// =============================================================================
// CHECK DEFINITION
// =============================================================================

export const sectionHeaderAboutPanel = defineCheck({
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  slug: 'section-header-about-panel',
  disabled: true,
  scope: { languages: ['typescript', 'tsx'], concerns: ['frontend', 'ui'] },
  contentFilter: 'code-only',

  confidence: 'medium',
  description:
    'Detects h2/h3 section headers without an adjacent AboutPanel — all sections should have contextual documentation',
  longDescription: `**Purpose:** Ensures every section header in the DevTools app has an adjacent AboutPanel providing contextual help.

**Detects:**
- \`<h2\` or \`<h3\` elements without an \`AboutPanel\` component within ±10 lines

**Why it matters:** Consistent contextual documentation improves discoverability and helps users understand what each section shows without leaving the page.

**Scope:** DevTools app pages, excluding modal and form files.`,
  tags: ['quality', 'devtools', 'ui', 'documentation', 'consistency'],
  fileTypes: ['ts', 'tsx'],

  analyze: analyzeFile,
})
