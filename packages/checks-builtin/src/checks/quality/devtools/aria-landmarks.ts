// @fitness-ignore-file file-length-limits -- isCommentLine function uses exhaustive multi-pattern comment detection (JSX, TSX, HTML) that resists decomposition
/**
 * @fileoverview ARIA Landmarks Check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/devtools/aria-landmarks
 * @version 1.0.0
 *
 * Detects accessibility issues with interactive elements in the DevTools portal:
 * - onClick handlers on <span> or <div> without role="button" and aria-label
 * - <button> elements with icon-only content missing aria-label
 */

import { defineCheck, type CheckViolation } from '@opensip-tools/core'
import { isCommentLine as isCodeComment } from '../../../utils/index.js'

// =============================================================================
// DETECTION HELPERS
// =============================================================================

/** Gather the full opening tag starting from a line (may span multiple lines). */
function gatherFullTag(lines: string[], startIndex: number, maxLines: number): string {
  let fullTag = ''
  for (let j = startIndex; j < Math.min(lines.length, startIndex + maxLines); j++) {
    fullTag += (lines[j] ?? '') + ' '
    if (fullTag.includes('>')) break
  }
  return fullTag
}

/** Check if a line is a comment (including JSX comments). */
function isCommentLine(trimmed: string): boolean {
  return isCodeComment(trimmed) || trimmed.startsWith('{/*')
}

/**
 * Detect clickable non-semantic elements (div/span with onClick but no role/aria-label).
 *
 * Pattern: <div onClick=... or <span onClick=... without role="button"
 */
function detectClickableNonSemanticElements(lines: string[]): CheckViolation[] {
  const violations: CheckViolation[] = []
  const clickablePattern = /(<(?:div|span)\s[^>]*onClick\s*=)/i

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()

    if (isCommentLine(trimmed)) continue

    const match = clickablePattern.exec(line)
    if (!match) continue

    const fullTag = gatherFullTag(lines, i, 5)
    const hasRole = /role\s*=\s*(?:['"]button['"]|\{['"]button['"]\})/.test(fullTag)
    if (hasRole) continue

    const hasAriaLabel = /aria-label\s*=/.test(fullTag)
    violations.push({
      type: 'clickable-non-semantic',
      line: i + 1,
      message: `Clickable <${line.includes('<span') ? 'span' : 'div'}> with onClick but missing role="button"${!hasAriaLabel ? ' and aria-label' : ''}`,
      severity: 'warning',
      suggestion:
        'Add role="button" and aria-label="descriptive label" to clickable non-semantic elements, ' +
        'or use a <button> element instead',
      match: trimmed.slice(0, 120),
    })
  }

  return violations
}

/** Check a single-line icon button for missing aria-label. */
function checkSingleLineIconButton(
  line: string,
  trimmed: string,
  lineNum: number,
): CheckViolation | null {
  const iconButtonPattern =
    /(<button\s[^>]*>)\s*(?:[\u{1F000}-\u{1FFFF}]|[^\s<]{1,2}|<\w+Icon\s*\/?>)\s*<\/button>/u
  const match = iconButtonPattern.exec(line)
  if (!match) return null

  const buttonTag = match[1] ?? ''
  if (/aria-label\s*=/.test(buttonTag)) return null

  return {
    type: 'icon-button-no-label',
    line: lineNum,
    message:
      'Icon-only <button> missing aria-label — screen readers cannot determine button purpose',
    severity: 'warning',
    suggestion:
      'Add aria-label="descriptive action" to describe the button purpose for assistive technology',
    match: trimmed.slice(0, 120),
  }
}

/** Check a multi-line icon button (button tag + short content + closing tag) for missing aria-label. */
function checkMultiLineIconButton(
  lines: string[],
  i: number,
  line: string,
  trimmed: string,
): CheckViolation | null {
  if (!/<button\s/.test(line) || /aria-label\s*=/.test(line)) return null
  if (i + 2 >= lines.length) return null

  const nextLine = (lines[i + 1] ?? '').trim()
  const afterLine = (lines[i + 2] ?? '').trim()

  if (nextLine.length > 3 || nextLine.length === 0 || !afterLine.startsWith('</button')) return null

  // Gather full tag for complete check
  let fullTag = line
  for (let j = Math.max(0, i - 2); j <= i; j++) {
    fullTag += (lines[j] ?? '') + ' '
  }
  if (/aria-label\s*=/.test(fullTag)) return null

  return {
    type: 'icon-button-no-label',
    line: i + 1,
    message: `Icon-only <button> with content "${nextLine}" missing aria-label`,
    severity: 'warning',
    suggestion: 'Add aria-label="descriptive action" to describe what this button does',
    match: trimmed.slice(0, 120),
  }
}

/**
 * Detect icon-only buttons missing aria-label.
 *
 * Pattern: <button> with only a single character, emoji, or icon component as content
 */
function detectIconOnlyButtons(lines: string[]): CheckViolation[] {
  const violations: CheckViolation[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()

    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue

    const singleLine = checkSingleLineIconButton(line, trimmed, i + 1)
    if (singleLine) {
      violations.push(singleLine)
    }

    const multiLine = checkMultiLineIconButton(lines, i, line, trimmed)
    if (multiLine) {
      violations.push(multiLine)
    }
  }

  return violations
}

// =============================================================================
// ANALYSIS FUNCTION
// =============================================================================

/**
 * Analyze a single file for ARIA landmark violations.
 */
function analyzeFile(content: string, _filePath: string): CheckViolation[] {
  const lines = content.split('\n')

  return [...detectClickableNonSemanticElements(lines), ...detectIconOnlyButtons(lines)]
}

// =============================================================================
// CHECK DEFINITION
// =============================================================================

/**
 * Check: quality/aria-landmarks
 *
 * Enforces ARIA attributes on interactive elements in the DevTools portal.
 */
export const ariaLandmarks = defineCheck({
  id: '2815dd76-6e9f-41a4-a80a-484aa55488f1',
  slug: 'aria-landmarks',
  disabled: true,
  scope: { languages: ['typescript', 'tsx'], concerns: ['frontend', 'ui'] },
  contentFilter: 'code-only',

  confidence: 'medium',
  description:
    'Detects clickable non-semantic elements and icon-only buttons missing ARIA attributes',
  longDescription: `**Purpose:** Enforces ARIA attributes on interactive elements for screen reader accessibility.

**Detects:**
- \`<div>\` or \`<span>\` with \`onClick\` but missing \`role="button"\` and/or \`aria-label\`
- Icon-only \`<button>\` elements (single character, emoji, or icon component content) missing \`aria-label\`

**Why it matters:** Without proper ARIA attributes, clickable elements are invisible to screen readers and keyboard-only users cannot determine button purposes.

**Scope:** General best practice (WCAG compliance). Analyzes each file individually.`,
  tags: ['quality', 'devtools', 'accessibility', 'aria', 'wcag'],
  fileTypes: ['ts', 'tsx'],

  analyze: analyzeFile,
})
