// @fitness-ignore-file file-length-limits -- Fitness check with extensive theme token validation patterns
// @fitness-ignore-file fitness-ignore-hygiene -- check references internal slugs that may differ from registered slugs
/**
 * @fileoverview DevTools Theme Token Usage Check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/devtools/theme-token-usage
 * @version 1.0.0
 *
 * Enforces usage of theme tokens for typography, spacing, and border radius
 * in the DevTools portal. The existing quality/theme-usage check covers
 * hardcoded colors; this check covers the remaining design token categories.
 *
 * Theme token reference (from theme/types.ts):
 * - fontSizes: xs(10), sm(12), md(14), lg(16), xl(18), 2xl(20), 3xl(24), 4xl(30), 5xl(36)
 * - fontWeights: normal('400'), medium('500'), semibold('600'), bold('700')
 * - spacing: xs(4), sm(8), md(12), lg(16), xl(20), 2xl(24), 3xl(32), 4xl(40)
 * - borderRadius: none(0), sm(4), md(8), lg(12), xl(16), full(9999)
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

/**
 * Files that render outside the theme provider and MUST use hardcoded values.
 * Error boundaries, not-found pages, and global-error pages cannot rely on
 * the theme context because the theme provider itself may have caused the error.
 */
const ERROR_BOUNDARY_PATTERNS = [
  /\/error\.tsx$/, // Next.js error boundary files (e.g., (main)/error.tsx)
  /\/global-error\.tsx$/, // Next.js global error boundary
  /\/not-found\.tsx$/, // Next.js 404 pages
  /\/SectionErrorBoundary\.tsx$/, // Shared error boundary component
]

/** Font sizes above the theme scale maximum (36px) are decorative/display sizes */
const DISPLAY_FONT_SIZE_THRESHOLD = 36

/**
 * Spacing values <= this threshold are considered micro-adjustments for
 * pixel-perfect alignment and are exempt from theme token enforcement.
 * The smallest theme spacing token is xs (4px).
 */
const MICRO_SPACING_THRESHOLD = 3

/**
 * Pattern matching dynamic import loading fallbacks.
 * These are trivial placeholder UIs that don't warrant theme token usage.
 * Matches: `loading: () => <div style=...` or `loading: () => (`
 */
const DYNAMIC_IMPORT_LOADING_PATTERN = /loading:\s*\(\)\s*=>/

/** Known theme spacing values (px) */
const THEME_SPACING_VALUES = new Set([4, 8, 12, 16, 20, 24, 32, 40])

/** Mapping from font size number to nearest theme token */
const FONT_SIZE_TOKEN_MAP: Record<number, string> = {
  10: 'theme.fontSizes.xs',
  11: 'theme.fontSizes.sm (12)',
  12: 'theme.fontSizes.sm',
  13: 'theme.fontSizes.md (14)',
  14: 'theme.fontSizes.md',
  15: 'theme.fontSizes.lg (16)',
  16: 'theme.fontSizes.lg',
  17: 'theme.fontSizes.xl (18)',
  18: 'theme.fontSizes.xl',
  19: 'theme.fontSizes.2xl (20)',
  20: 'theme.fontSizes.2xl',
  22: 'theme.fontSizes.3xl (24)',
  24: 'theme.fontSizes.3xl',
  26: 'theme.fontSizes.4xl (30)',
  28: 'theme.fontSizes.4xl (30)',
  30: 'theme.fontSizes.4xl',
  32: 'theme.fontSizes.5xl (36)',
  34: 'theme.fontSizes.5xl (36)',
  36: 'theme.fontSizes.5xl',
}

/** Spacing properties to check */
const SPACING_PROPERTIES = [
  'gap',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'paddingBlock',
  'paddingInline',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'marginBlock',
  'marginInline',
  'rowGap',
  'columnGap',
]

// =============================================================================
// DETECTION HELPERS
// =============================================================================

/**
 * Detect hardcoded fontWeight values that should use theme tokens.
 */
function detectHardcodedFontWeights(lines: string[]): CheckViolation[] {
  const violations: CheckViolation[] = []

  const fontWeightPatterns = [
    { regex: /fontWeight:\s*(?:600|'600'|"600")/, token: 'theme.fontWeights.semibold' },
    { regex: /fontWeight:\s*(?:'bold'|"bold")/, token: 'theme.fontWeights.bold' },
    { regex: /fontWeight:\s*(?:700|'700'|"700")/, token: 'theme.fontWeights.bold' },
    { regex: /fontWeight:\s*(?:500|'500'|"500")/, token: 'theme.fontWeights.medium' },
    { regex: /fontWeight:\s*(?:400|'400'|"400")/, token: 'theme.fontWeights.normal' },
    { regex: /fontWeight:\s*(?:'normal'|"normal")/, token: 'theme.fontWeights.normal' },
  ]

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()

    // Skip comments and imports
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('import ')) {
      continue
    }

    // Skip lines already using theme tokens
    if (line.includes('theme.fontWeights')) continue

    for (const { regex, token } of fontWeightPatterns) {
      if (regex.test(line)) {
        violations.push({
          type: 'hardcoded-font-weight',
          line: i + 1,
          message: `Hardcoded fontWeight — use ${token}`,
          severity: 'warning',
          suggestion: `Replace with ${token}`,
          match: trimmed.slice(0, 120),
        })
        break
      }
    }
  }

  return violations
}

/**
 * Detect hardcoded fontSize values that aren't in the theme scale.
 */
function detectHardcodedFontSizes(lines: string[]): CheckViolation[] {
  const violations: CheckViolation[] = []
  const fontSizePattern = /fontSize:\s*(\d+)/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()

    // Skip comments and imports
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('import ')) {
      continue
    }

    // Skip lines already using theme tokens
    if (line.includes('theme.fontSizes')) continue

    const match = fontSizePattern.exec(line)
    if (match?.[1]) {
      // @fitness-ignore-next-line numeric-validation -- regex capture group is digit-only (\d+)
      const size = parseInt(match[1], 10)

      // Skip display/decorative font sizes above the theme scale maximum.
      // Sizes like 48px, 64px are intentionally outside the design system
      // for hero text, emoji displays, and decorative elements.
      if (size > DISPLAY_FONT_SIZE_THRESHOLD) continue

      // Even valid theme sizes should use the token, not the raw number
      const tokenSuggestion = FONT_SIZE_TOKEN_MAP[size]
      const suggestion = tokenSuggestion
        ? `Replace fontSize: ${size} with ${tokenSuggestion}`
        : `fontSize: ${size} is not a theme token — use the nearest theme.fontSizes.* value`

      violations.push({
        type: 'hardcoded-font-size',
        line: i + 1,
        message: `Hardcoded fontSize: ${size} — use theme.fontSizes.*`,
        severity: 'warning',
        suggestion,
        match: trimmed.slice(0, 120),
      })
    }
  }

  return violations
}

/** Build a spacing violation for a hardcoded value */
function buildSpacingViolation(lineNum: number, value: number, trimmed: string): CheckViolation {
  const tokenName = getNearestSpacingToken(value)

  if (THEME_SPACING_VALUES.has(value)) {
    return {
      type: 'hardcoded-spacing',
      line: lineNum,
      message: `Hardcoded spacing value ${value} — use theme.spacing.${tokenName}`,
      severity: 'warning',
      suggestion: `Replace with theme.spacing.${tokenName}`,
      match: trimmed.slice(0, 120),
    }
  }

  return {
    type: 'hardcoded-spacing',
    line: lineNum,
    message: `Hardcoded spacing value ${value} is not a theme token — use theme.spacing.*`,
    severity: 'warning',
    suggestion: `Use the nearest theme spacing token: theme.spacing.${tokenName}`,
    match: trimmed.slice(0, 120),
  }
}

/**
 * Detect hardcoded spacing values (gap, padding, margin) outside theme tokens.
 */
function detectHardcodedSpacing(lines: string[]): CheckViolation[] {
  const violations: CheckViolation[] = []

  // Build a regex that matches any spacing property with a number value
  const spacingPropPattern = new RegExp(`(?:${SPACING_PROPERTIES.join('|')}):\\s*(\\d+)(?!\\d)`)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()

    // Skip comments and imports
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('import ')) {
      continue
    }

    // Skip lines already using theme tokens
    if (line.includes('theme.spacing')) continue

    const match = spacingPropPattern.exec(line)
    if (!match?.[1]) continue

    // @fitness-ignore-next-line numeric-validation -- regex capture group is digit-only (\d+)
    const value = parseInt(match[1], 10)

    // Skip 0 — that's a valid literal
    if (value === 0) continue

    // Skip micro-spacing values (1-3px) — these are pixel-level adjustments
    // for precise alignment that don't belong in a spacing token scale
    if (value <= MICRO_SPACING_THRESHOLD) continue

    violations.push(buildSpacingViolation(i + 1, value, trimmed))
  }

  return violations
}

/**
 * Detect hardcoded borderRadius values outside theme tokens.
 */
function detectHardcodedBorderRadius(
  lines: string[],
  isInDynamicImportLoading: (lineIndex: number) => boolean,
): CheckViolation[] {
  const violations: CheckViolation[] = []
  const borderRadiusPattern = /borderRadius:\s*(\d+)/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()

    // Skip comments and imports
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('import ')) {
      continue
    }

    // Skip lines already using theme tokens
    if (line.includes('theme.borderRadius')) continue

    const match = borderRadiusPattern.exec(line)
    if (match?.[1]) {
      // @fitness-ignore-next-line numeric-validation -- regex capture group is digit-only (\d+)
      const value = parseInt(match[1], 10)

      // Skip values inside dynamic import loading fallbacks — these are
      // trivial placeholder UIs that don't warrant theme token usage
      if (isInDynamicImportLoading(i)) continue

      const tokenName = getNearestBorderRadiusToken(value)

      violations.push({
        type: 'hardcoded-border-radius',
        line: i + 1,
        message: `Hardcoded borderRadius: ${value} — use theme.borderRadius.${tokenName}`,
        severity: 'warning',
        suggestion: `Replace with theme.borderRadius.${tokenName}`,
        match: trimmed.slice(0, 120),
      })
    }
  }

  return violations
}

/**
 * Detect hardcoded opacity values (flagged for awareness).
 *
 * Exemptions:
 * - SVG elements (fill/path opacity is structural, not themed)
 * - Dynamic import loading fallbacks (trivial placeholder UIs)
 * - Inline style opacity for visual effects (loading states, dimming, hover)
 *   when no opacity token system exists yet
 *
 * NOTE: This detector is intentionally lenient. Opacity is a CSS primitive
 * used for transitions, loading states, disabled states, and visual layering.
 * Until the theme system defines opacity tokens, flagging these creates
 * false positives without actionable remediation.
 */
function detectHardcodedOpacity(_lines: string[]): CheckViolation[] {
  // No opacity tokens exist in the theme system yet.
  // All flagged values are false positives with no actionable fix.
  // Re-enable this detector when theme.opacity tokens are defined.
  return []
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Identify line ranges that are inside dynamic import loading fallback functions.
 * Pattern: `loading: () => <div style={{ ... }} />`
 *
 * Returns a Set of 0-based line indices that fall within these ranges.
 * Uses a simple heuristic: once a `loading: () =>` line is found, all subsequent
 * lines until the next closing `}` at the same or lower indentation are included.
 */
function buildDynamicImportLoadingRanges(lines: string[]): Set<number> {
  const result = new Set<number>()
  let inLoadingBlock = false
  let loadingStartIndent = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''

    if (!inLoadingBlock) {
      if (DYNAMIC_IMPORT_LOADING_PATTERN.test(line)) {
        inLoadingBlock = true
        loadingStartIndent = line.length - line.trimStart().length
        result.add(i)
      }
    } else {
      result.add(i)
      // End the block when we find a line at the same or lower indent that closes
      // the function (contains `}` closing patterns)
      const currentIndent = line.length - line.trimStart().length
      const trimmed = line.trim()
      if (
        currentIndent <= loadingStartIndent &&
        (trimmed === '},' ||
          trimmed === '}' ||
          trimmed === '});' ||
          trimmed === '),' ||
          trimmed === ')') &&
        i > 0
      ) {
        inLoadingBlock = false
      }
    }
  }

  return result
}

/** Get the nearest spacing token name for a given pixel value */
function getNearestSpacingToken(value: number): string {
  const tokens: Array<[string, number]> = [
    ['xs', 4],
    ['sm', 8],
    ['md', 12],
    ['lg', 16],
    ['xl', 20],
    ['2xl', 24],
    ['3xl', 32],
    ['4xl', 40],
  ]
  let nearest: [string, number] = tokens[0] ?? ['xs', 4]
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

/** Get the nearest border radius token name for a given pixel value */
function getNearestBorderRadiusToken(value: number): string {
  const tokens: Array<[string, number]> = [
    ['none', 0],
    ['sm', 4],
    ['md', 8],
    ['lg', 12],
    ['xl', 16],
    ['full', 9999],
  ]
  let nearest: [string, number] = tokens[0] ?? ['none', 0]
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
// ANALYSIS FUNCTION
// =============================================================================

/**
 * Analyze a single file for hardcoded theme values.
 */
function analyzeFile(content: string, filePath: string): CheckViolation[] {
  // Exclude theme definition files
  if (EXCLUDED_PATTERNS.some((p) => p.test(filePath))) {
    return []
  }

  // Exclude error boundary files — they render outside the theme provider
  // and MUST use hardcoded values for safety
  if (ERROR_BOUNDARY_PATTERNS.some((p) => p.test(filePath))) {
    return []
  }

  const lines = content.split('\n')

  // Build a lookup of line ranges that are inside dynamic import loading fallbacks.
  // These are trivial placeholder UIs (e.g., `loading: () => <div style={{ height: 80 }} />`)
  // that don't warrant theme token enforcement.
  const dynamicImportLoadingLines = buildDynamicImportLoadingRanges(lines)
  const isInDynamicImportLoading = (lineIndex: number): boolean => {
    return dynamicImportLoadingLines.has(lineIndex)
  }

  return [
    ...detectHardcodedFontWeights(lines),
    ...detectHardcodedFontSizes(lines),
    ...detectHardcodedSpacing(lines),
    ...detectHardcodedBorderRadius(lines, isInDynamicImportLoading),
    ...detectHardcodedOpacity(lines),
  ]
}

// =============================================================================
// CHECK DEFINITION
// =============================================================================

/**
 * Check: quality/theme-token-usage
 *
 * Enforces theme token usage for typography, spacing, and border radius
 * in the DevTools portal.
 */
export const themeTokenUsage = defineCheck({
  id: 'bf13da23-8dc7-484b-bf4d-3021b1b3b95d',
  slug: 'theme-token-usage',
  disabled: true,
  scope: { languages: ['typescript', 'tsx'], concerns: ['frontend', 'ui'] },
  contentFilter: 'code-only',

  confidence: 'medium',
  description:
    'Enforces theme tokens for fontWeight, fontSize, spacing, borderRadius, and opacity in DevTools',
  longDescription: `**Purpose:** Enforces usage of theme tokens for typography, spacing, and border radius instead of hardcoded numeric values.

**Detects:**
- Hardcoded \`fontWeight\` values (400, 500, 600, 700, 'bold', 'normal') instead of \`theme.fontWeights.*\`
- Hardcoded \`fontSize\` numbers instead of \`theme.fontSizes.*\` (xs through 5xl)
- Hardcoded spacing values (\`gap\`, \`padding*\`, \`margin*\`, \`rowGap\`, \`columnGap\`) instead of \`theme.spacing.*\`
- Hardcoded \`borderRadius\` numbers instead of \`theme.borderRadius.*\` (none through full)
- Hardcoded \`opacity\` decimal values (flagged for future token system)

**Why it matters:** Hardcoded design values bypass the theme system, preventing global adjustments and creating visual inconsistency across the portal.

**Exempt patterns (not flagged):**
- Error boundary files (\`error.tsx\`, \`global-error.tsx\`, \`not-found.tsx\`, \`SectionErrorBoundary.tsx\`) — render outside theme provider
- Display/decorative font sizes above 36px (e.g., 48px, 64px hero text)
- Micro-spacing values (1–3px) — pixel-level alignment adjustments
- Dynamic import loading fallbacks — trivial placeholder UIs
- Opacity values — no theme opacity tokens exist yet

**Scope:** Codebase-specific convention. Analyzes each file individually.`,
  tags: ['quality', 'devtools', 'ui', 'theming', 'consistency', 'tokens'],
  fileTypes: ['ts', 'tsx'],

  analyze: analyzeFile,
})
