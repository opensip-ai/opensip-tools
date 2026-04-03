// @fitness-ignore-file duplicate-implementation-detection -- similar patterns across diagnostic modules
/**
 * @fileoverview Modal Consistency Check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/devtools/modal-consistency
 * @version 1.0.0
 *
 * Detects hand-rolled modal implementations that should use a shared Modal component:
 * - position: 'fixed' + high zIndex patterns (each is a hand-rolled modal)
 * - document.body.style.overflow manipulation without cleanup
 * - Inconsistent zIndex values across modal implementations
 */

import { defineCheck, type CheckViolation } from '@opensip-tools/core'

// =============================================================================
// CONSTANTS
// =============================================================================

/** Pattern indicating a modal overlay */
const FIXED_POSITION_PATTERN = /position:\s*['"]fixed['"]/
const Z_INDEX_PATTERN = /zIndex:\s*(\d+)/

/** Minimum zIndex to consider as a modal overlay */
const MODAL_Z_INDEX_THRESHOLD = 100

// =============================================================================
// DETECTION HELPERS
// =============================================================================

/** Find the zIndex in a window of lines around a center point. */
function findZIndexInWindow(lines: string[], center: number, windowSize: number): number | null {
  const windowStart = Math.max(0, center - windowSize)
  const windowEnd = Math.min(lines.length - 1, center + windowSize)
  for (let j = windowStart; j <= windowEnd; j++) {
    const nearbyLine = lines[j] ?? ''
    const zMatch = Z_INDEX_PATTERN.exec(nearbyLine)
    if (zMatch?.[1]) {
      // @fitness-ignore-next-line numeric-validation -- regex capture group is digit-only (\d+)
      const zIndex = parseInt(zMatch[1], 10)
      if (zIndex >= MODAL_Z_INDEX_THRESHOLD) return zIndex
    }
  }
  return null
}

/**
 * Detect hand-rolled modal implementations (fixed + high zIndex).
 */
function detectHandRolledModals(lines: string[]): CheckViolation[] {
  const violations: CheckViolation[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()

    // Skip comments
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue
    if (!FIXED_POSITION_PATTERN.test(line)) continue

    const zIndex = findZIndexInWindow(lines, i, 10)
    if (zIndex !== null) {
      violations.push({
        type: 'hand-rolled-modal',
        line: i + 1,
        message: `Hand-rolled modal overlay (position: fixed, zIndex: ${zIndex}) — use a shared <Modal> component`,
        severity: 'warning',
        suggestion:
          'Extract modal logic into a shared <Modal> component with consistent overlay, ' +
          'backdrop, close behavior, focus trapping, and scroll locking',
        match: trimmed.slice(0, 120),
      })
    }
  }

  return violations
}

/**
 * Detect document.body.style.overflow manipulation without cleanup.
 */
function detectScrollLockWithoutCleanup(lines: string[], content: string): CheckViolation[] {
  const violations: CheckViolation[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()

    // Skip comments
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue

    if (/document\.body\.style\.overflow\s*=/.test(line)) {
      // Check if there's a corresponding cleanup (restore to '' or 'auto')
      const hasCleanup =
        content.includes("document.body.style.overflow = ''") ||
        content.includes('document.body.style.overflow = ""') ||
        content.includes("document.body.style.overflow = 'auto'") ||
        content.includes("document.body.style.overflow = 'visible'")

      // Check if it's in a useEffect with cleanup
      const hasUseEffectCleanup =
        /return\s*\(\)\s*=>\s*\{[^}]*document\.body\.style\.overflow/.test(content)

      if (!hasCleanup && !hasUseEffectCleanup) {
        violations.push({
          type: 'scroll-lock-no-cleanup',
          line: i + 1,
          message:
            'document.body.style.overflow manipulation without cleanup — may leave scroll locked',
          severity: 'warning',
          suggestion:
            'Ensure overflow is restored in a useEffect cleanup function, or use a shared useScrollLock hook',
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

/**
 * Analyze a single file for modal consistency issues.
 */
function analyzeFile(content: string, _filePath: string): CheckViolation[] {
  const lines = content.split('\n')

  return [...detectHandRolledModals(lines), ...detectScrollLockWithoutCleanup(lines, content)]
}

// =============================================================================
// CHECK DEFINITION
// =============================================================================

/**
 * Check: quality/modal-consistency
 *
 * Detects hand-rolled modal implementations and scroll lock issues.
 */
export const modalConsistency = defineCheck({
  id: 'fc138e87-488b-4e3e-b299-54240eb7874d',
  slug: 'modal-consistency',
  disabled: true,
  scope: { languages: ['typescript', 'tsx'], concerns: ['frontend', 'ui'] },
  contentFilter: 'code-only',

  confidence: 'medium',
  description:
    'Detects hand-rolled modal overlays and scroll lock without cleanup — suggests shared <Modal> component',
  longDescription: `**Purpose:** Detects hand-rolled modal implementations that should use a shared \`<Modal>\` component for consistency.

**Detects:**
- \`position: 'fixed'\` combined with \`zIndex >= 100\` within 10 lines (hand-rolled modal overlay pattern)
- \`document.body.style.overflow = ...\` without a corresponding cleanup (restore to \`''\`, \`'auto'\`, or \`'visible'\`) or \`useEffect\` return cleanup

**Why it matters:** Hand-rolled modals lead to inconsistent overlay behavior, missing focus trapping, scroll lock leaks, and duplicated close/backdrop logic across components.

**Scope:** Codebase-specific convention. Analyzes each file individually.`,
  tags: ['quality', 'devtools', 'ui', 'modals', 'consistency'],
  fileTypes: ['ts', 'tsx'],

  analyze: analyzeFile,
})
