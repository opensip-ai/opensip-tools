/**
 * @fileoverview Shared Component Usage Check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/devtools/shared-component-usage
 * @version 1.0.0
 *
 * Detects duplicated page-level patterns that should use shared components:
 * - Page wrapper pattern (maxWidth: 1400, margin: '0 auto')
 * - Loading state pattern (Loading {word}... text in styled divs)
 * - Error state pattern (theme.colors.errorLight + error border)
 *
 * Note: The shared components (PageWrapper, PageLoading, PageError) may not
 * exist yet. This check identifies WHERE they should be used, helping scope
 * the remediation work.
 */

import { defineCheck, type CheckViolation } from '@opensip-tools/core'

// =============================================================================
// DETECTION HELPERS
// =============================================================================

/**
 * Detect page wrapper duplication pattern.
 * Pattern: maxWidth: 1400 + margin: '0 auto' in the same file
 */
function detectPageWrapperDuplication(lines: string[]): CheckViolation[] {
  const violations: CheckViolation[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()

    // Skip comments
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue

    // Look for the maxWidth: 1400 pattern
    if (/maxWidth:\s*1400/.test(line)) {
      // Check nearby lines (within 5 lines) for margin: '0 auto'
      const windowStart = Math.max(0, i - 5)
      const windowEnd = Math.min(lines.length - 1, i + 5)
      for (let j = windowStart; j <= windowEnd; j++) {
        const nearby = lines[j] ?? ''
        if (/margin:\s*['"]0 auto['"]/.test(nearby)) {
          violations.push({
            type: 'page-wrapper-duplication',
            line: i + 1,
            message:
              "Page wrapper pattern (maxWidth: 1400 + margin: '0 auto') — extract to shared <PageWrapper>",
            severity: 'warning',
            suggestion: 'Create and use a shared <PageWrapper> component from @/components/shared/',
            match: trimmed.slice(0, 120),
          })
          break
        }
      }
    }
  }

  return violations
}

/**
 * Detect loading state duplication pattern.
 * Pattern: "Loading {word}..." text inside styled containers
 */
function detectLoadingStateDuplication(lines: string[]): CheckViolation[] {
  const violations: CheckViolation[] = []
  const loadingTextPattern = /['"`]Loading\s+\w+\.{3}['"`]|>\s*Loading\s+\w+\.\.\.\s*</

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()

    // Skip comments
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue

    if (loadingTextPattern.test(line)) {
      violations.push({
        type: 'loading-state-duplication',
        line: i + 1,
        message: 'Inline loading state — extract to shared <PageLoading> component',
        severity: 'warning',
        suggestion:
          'Create and use a shared <PageLoading message="Loading {thing}..." /> component',
        match: trimmed.slice(0, 120),
      })
    }
  }

  return violations
}

/**
 * Detect error state duplication pattern.
 * Pattern: theme.colors.errorLight + theme.colors.error + border styling
 */
function detectErrorStateDuplication(lines: string[]): CheckViolation[] {
  const violations: CheckViolation[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()

    // Skip comments
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue

    // Look for errorLight background pattern
    if (line.includes('theme.colors.errorLight')) {
      // Check nearby lines for error border pattern
      const windowStart = Math.max(0, i - 5)
      const windowEnd = Math.min(lines.length - 1, i + 5)
      for (let j = windowStart; j <= windowEnd; j++) {
        const nearby = lines[j] ?? ''
        if (nearby.includes('theme.colors.error') && nearby.includes('border')) {
          violations.push({
            type: 'error-state-duplication',
            line: i + 1,
            message:
              'Inline error state with errorLight + error border — extract to shared <PageError>',
            severity: 'warning',
            suggestion: 'Create and use a shared <PageError message="..." /> component',
            match: trimmed.slice(0, 120),
          })
          break
        }
      }
    }
  }

  return violations
}

// =============================================================================
// ANALYSIS FUNCTION
// =============================================================================

/**
 * Analyze a single page file for shared component opportunities.
 */
function analyzeFile(content: string, _filePath: string): CheckViolation[] {
  const lines = content.split('\n')

  return [
    ...detectPageWrapperDuplication(lines),
    ...detectLoadingStateDuplication(lines),
    ...detectErrorStateDuplication(lines),
  ]
}

// =============================================================================
// CHECK DEFINITION
// =============================================================================

/**
 * Check: quality/shared-component-usage
 *
 * Identifies duplicated page-level patterns that should use shared components.
 */
export const sharedComponentUsage = defineCheck({
  id: '86a7423c-ceda-42cc-9f81-cc545e1782f6',
  slug: 'shared-component-usage',
  disabled: true,
  scope: { languages: ['typescript', 'tsx'], concerns: ['frontend', 'ui'] },
  contentFilter: 'code-only',

  confidence: 'medium',
  description:
    'Detects duplicated page wrapper, loading, and error patterns — suggests shared components',
  longDescription: `**Purpose:** Identifies duplicated page-level UI patterns that should be extracted into shared components.

**Detects:**
- Page wrapper duplication: \`maxWidth: 1400\` combined with \`margin: '0 auto'\` within 5 lines
- Loading state duplication: \`"Loading {word}..."\` text patterns in styled containers
- Error state duplication: \`theme.colors.errorLight\` combined with \`theme.colors.error\` + \`border\` within 5 lines

**Why it matters:** Duplicated page wrapper, loading, and error patterns create maintenance burden and visual inconsistency. Shared components (\`<PageWrapper>\`, \`<PageLoading>\`, \`<PageError>\`) ensure uniform behavior.

**Scope:** Codebase-specific convention. Analyzes each file individually.`,
  tags: ['quality', 'devtools', 'ui', 'duplication', 'components'],
  fileTypes: ['ts', 'tsx'],

  analyze: analyzeFile,
})
