// @fitness-ignore-file duplicate-implementation-detection -- similar patterns across diagnostic modules
/**
 * @fileoverview Modal Accessibility Check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/devtools/modal-accessibility
 * @version 1.0.0
 *
 * Detects modal/overlay components missing WCAG-required accessibility attributes:
 * - role="dialog" or role="alertdialog"
 * - aria-modal="true"
 * - aria-labelledby
 * - onKeyDown handler (for ESC key dismissal)
 *
 * Detection strategy: Find the fixed+zIndex overlay pattern, then check for
 * required ARIA attributes within the surrounding component code.
 */

import { defineCheck, type CheckViolation } from '@opensip-tools/core'

// =============================================================================
// CONSTANTS
// =============================================================================

/** Pattern indicating a modal overlay: position: 'fixed' with a high zIndex */
const FIXED_POSITION_PATTERN = /position:\s*['"]fixed['"]/
const Z_INDEX_PATTERN = /zIndex:\s*(\d+)/

/** Minimum zIndex to consider as a modal overlay (not just a dropdown) */
const MODAL_Z_INDEX_THRESHOLD = 100

// =============================================================================
// DETECTION HELPERS
// =============================================================================

/** Find the zIndex in a window of lines around a center point. */
function findZIndexNearby(lines: string[], center: number, windowSize: number): number | null {
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

/** Scan lines for fixed-position + high-zIndex overlay patterns. */
function findModalLocations(lines: string[]): Array<{ line: number; zIndex: number }> {
  const locations: Array<{ line: number; zIndex: number }> = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue
    if (!FIXED_POSITION_PATTERN.test(line)) continue

    const zIndex = findZIndexNearby(lines, i, 10)
    if (zIndex !== null) {
      locations.push({ line: i + 1, zIndex })
    }
  }
  return locations
}

interface AriaCheckResult {
  hasDialogRole: boolean
  hasAriaModal: boolean
  hasAriaLabelledBy: boolean
  hasKeyDownHandler: boolean
}

/** Check for required ARIA attributes in the file content. */
function checkAriaAttributes(content: string): AriaCheckResult {
  return {
    hasDialogRole:
      content.includes('role="dialog"') ||
      content.includes("role='dialog'") ||
      content.includes('role="alertdialog"') ||
      content.includes("role='alertdialog'"),
    hasAriaModal: content.includes('aria-modal="true"') || content.includes("aria-modal='true'"),
    hasAriaLabelledBy: content.includes('aria-labelledby') || content.includes('aria-labelledBy'),
    hasKeyDownHandler:
      content.includes('onKeyDown') ||
      content.includes('onkeydown') ||
      content.includes("addEventListener('keydown") ||
      content.includes('addEventListener("keydown'),
  }
}

/** Report ARIA violations for a single modal location. */
function reportModalViolations(
  modal: { line: number; zIndex: number },
  aria: AriaCheckResult,
): CheckViolation[] {
  const violations: CheckViolation[] = []

  if (!aria.hasDialogRole) {
    violations.push({
      type: 'modal-missing-role',
      line: modal.line,
      message: `Modal overlay (zIndex: ${modal.zIndex}) missing role="dialog" or role="alertdialog"`,
      severity: 'error',
      suggestion: 'Add role="dialog" to the modal container element for WCAG 2.1 compliance',
    })
  }
  if (!aria.hasAriaModal) {
    violations.push({
      type: 'modal-missing-aria-modal',
      line: modal.line,
      message: `Modal overlay (zIndex: ${modal.zIndex}) missing aria-modal="true"`,
      severity: 'error',
      suggestion: 'Add aria-modal="true" to indicate content behind the modal is inert',
    })
  }
  if (!aria.hasAriaLabelledBy) {
    violations.push({
      type: 'modal-missing-labelledby',
      line: modal.line,
      message: `Modal overlay (zIndex: ${modal.zIndex}) missing aria-labelledby`,
      severity: 'error',
      suggestion: 'Add aria-labelledby pointing to the modal title element ID',
    })
  }
  if (!aria.hasKeyDownHandler) {
    violations.push({
      type: 'modal-missing-escape',
      line: modal.line,
      message: `Modal overlay (zIndex: ${modal.zIndex}) has no keyboard handler — ESC key dismissal may be missing`,
      severity: 'error',
      suggestion: 'Add an onKeyDown handler that calls close/dismiss when Escape is pressed',
    })
  }

  return violations
}

// =============================================================================
// DETECTION
// =============================================================================

/**
 * Analyze a file for modal accessibility violations.
 *
 * Strategy: Scan for `position: 'fixed'` + high `zIndex` patterns that indicate
 * a modal overlay. Then check the surrounding component for required ARIA attributes.
 */
function analyzeFile(content: string, _filePath: string): CheckViolation[] {
  const lines = content.split('\n')
  const modalLocations = findModalLocations(lines)
  if (modalLocations.length === 0) return []

  const aria = checkAriaAttributes(content)
  return modalLocations.flatMap((modal) => reportModalViolations(modal, aria))
}

// =============================================================================
// CHECK DEFINITION
// =============================================================================

/**
 * Check: quality/modal-accessibility
 *
 * Enforces WCAG-required accessibility attributes on modal/overlay components.
 */
export const modalAccessibility = defineCheck({
  id: 'cf2933d5-a795-48e1-9c3d-c2f34cb3e1e0',
  slug: 'modal-accessibility',
  disabled: true,
  scope: { languages: ['typescript', 'tsx'], concerns: ['frontend', 'ui'] },
  contentFilter: 'code-only',

  confidence: 'medium',
  description:
    'Enforces ARIA roles, aria-modal, aria-labelledby, and keyboard handlers on modal overlays',
  longDescription: `**Purpose:** Enforces WCAG-required accessibility attributes on modal/overlay components.

**Detects:**
- Components with \`position: 'fixed'\` and \`zIndex >= 100\` (modal overlay heuristic) missing:
  - \`role="dialog"\` or \`role="alertdialog"\`
  - \`aria-modal="true"\`
  - \`aria-labelledby\` attribute
  - \`onKeyDown\` or \`addEventListener('keydown')\` handler for ESC key dismissal

**Why it matters:** Modals without ARIA attributes trap screen reader users and prevent keyboard-only users from dismissing overlays, violating WCAG 2.1 compliance.

**Scope:** General best practice (WCAG compliance). Analyzes each file individually.`,
  tags: ['quality', 'devtools', 'accessibility', 'wcag', 'modals'],
  fileTypes: ['ts', 'tsx'],

  analyze: analyzeFile,
})
