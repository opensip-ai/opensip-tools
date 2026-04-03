/**
 * @fileoverview Heading Style Consistency Check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/devtools/heading-style-consistency
 * @version 1.0.0
 *
 * Detects heading elements not using standard theme tokens for font size and weight.
 * h1: theme.fontSizes["2xl"] + theme.fontWeights.bold
 * h2/h3: theme.fontSizes.xl + theme.fontWeights.semibold
 */

import { defineCheck, type CheckViolation } from '@opensip-tools/core'

// =============================================================================
// CONSTANTS
// =============================================================================

const H1_REGEX = /<h1[\s>]/
const H2H3_REGEX = /<h[23][\s>]/

/** h1 standard: fontSize["2xl"], fontWeights.bold */
const H1_VALID_FONT_SIZE = 'fontSizes["2xl"]'
const H1_VALID_FONT_WEIGHT = 'theme.fontWeights.bold'

/** h2/h3 standard: fontSizes.xl, fontWeights.semibold */
const H2H3_VALID_FONT_SIZE = 'theme.fontSizes.xl'
const H2H3_VALID_FONT_WEIGHT = 'theme.fontWeights.semibold'

// =============================================================================
// DETECTION
// =============================================================================

function checkHeadingWindow(
  lines: string[],
  startLine: number,
  validFontSize: string,
  validFontWeight: string,
): { hasFontSize: boolean; hasFontWeight: boolean } {
  const windowEnd = Math.min(lines.length - 1, startLine + 8)
  let hasFontSize = false
  let hasFontWeight = false

  for (let j = startLine; j <= windowEnd; j++) {
    const nearby = lines[j] ?? ''
    if (nearby.includes(validFontSize)) hasFontSize = true
    if (nearby.includes(validFontWeight)) hasFontWeight = true
  }

  return { hasFontSize, hasFontWeight }
}

/** Build a list of missing token names based on font size/weight presence */
function buildMissingTokenList(
  hasFontSize: boolean,
  hasFontWeight: boolean,
  fontSizeLabel: string,
  fontWeightLabel: string,
): string[] {
  const missing: string[] = []
  if (!hasFontSize) missing.push(fontSizeLabel)
  if (!hasFontWeight) missing.push(fontWeightLabel)
  return missing
}

/** Check an h1 heading and return a violation if theme tokens are missing */
function checkH1Heading(
  lines: string[],
  lineIndex: number,
  trimmed: string,
): CheckViolation | null {
  const { hasFontSize, hasFontWeight } = checkHeadingWindow(
    lines,
    lineIndex,
    H1_VALID_FONT_SIZE,
    H1_VALID_FONT_WEIGHT,
  )

  if (hasFontSize && hasFontWeight) return null

  const missing = buildMissingTokenList(
    hasFontSize,
    hasFontWeight,
    'fontSizes["2xl"]',
    'theme.fontWeights.bold',
  )

  return {
    type: 'heading-style-inconsistency',
    line: lineIndex + 1,
    message: `h1 heading missing standard theme tokens: ${missing.join(', ')}`,
    severity: 'warning',
    suggestion: 'Use theme.fontSizes["2xl"] and theme.fontWeights.bold for h1 headings',
    match: trimmed.slice(0, 120),
  }
}

/** Check an h2/h3 heading and return a violation if theme tokens are missing */
function checkH2H3Heading(
  lines: string[],
  lineIndex: number,
  trimmed: string,
): CheckViolation | null {
  const { hasFontSize, hasFontWeight } = checkHeadingWindow(
    lines,
    lineIndex,
    H2H3_VALID_FONT_SIZE,
    H2H3_VALID_FONT_WEIGHT,
  )

  if (hasFontSize && hasFontWeight) return null

  const missing = buildMissingTokenList(
    hasFontSize,
    hasFontWeight,
    'theme.fontSizes.xl',
    'theme.fontWeights.semibold',
  )

  return {
    type: 'heading-style-inconsistency',
    line: lineIndex + 1,
    message: `Section heading missing standard theme tokens: ${missing.join(', ')}`,
    severity: 'warning',
    suggestion: 'Use theme.fontSizes.xl and theme.fontWeights.semibold for section headings',
    match: trimmed.slice(0, 120),
  }
}

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

    const isH1 = H1_REGEX.test(line)
    const isH2H3 = !isH1 && H2H3_REGEX.test(line)

    if (isH1) {
      const violation = checkH1Heading(lines, i, trimmed)
      if (violation) violations.push(violation)
    } else if (isH2H3) {
      const violation = checkH2H3Heading(lines, i, trimmed)
      if (violation) violations.push(violation)
    }
  }

  return violations
}

// =============================================================================
// CHECK DEFINITION
// =============================================================================

export const headingStyleConsistency = defineCheck({
  id: 'd4e5f6a7-b8c9-0123-defa-456789012345',
  slug: 'heading-style-consistency',
  disabled: true,
  scope: { languages: ['typescript', 'tsx'], concerns: ['frontend', 'ui'] },
  contentFilter: 'code-only',

  confidence: 'medium',
  description:
    'Detects headings not using standard theme tokens — enforce consistent heading styles',
  longDescription: `**Purpose:** Ensures headings use consistent theme tokens for font size and weight.

**Detects:**
- \`<h1\` elements without \`fontSizes["2xl"]\` or \`fontWeights.bold\` within 8 lines
- \`<h2\` or \`<h3\` elements without \`theme.fontSizes.xl\` or \`theme.fontWeights.semibold\` within 8 lines

**Standards:**
- h1: \`theme.fontSizes["2xl"]\` + \`theme.fontWeights.bold\`
- h2/h3: \`theme.fontSizes.xl\` + \`theme.fontWeights.semibold\`

**Why it matters:** Inconsistent heading styles create visual dissonance across the DevTools app. Standardizing on theme tokens ensures uniform appearance and makes global style changes easier.

**Scope:** DevTools app files, excluding tests.`,
  tags: ['quality', 'devtools', 'ui', 'consistency', 'styling'],
  fileTypes: ['ts', 'tsx'],

  analyze: analyzeFile,
})
