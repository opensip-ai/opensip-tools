// @fitness-ignore-file semgrep-scan -- non-literal RegExp patterns use hardcoded constants from ICON_MAP_IMPORTS, not user input; regex operates on bounded, trusted codebase files
// @fitness-ignore-file duplicate-implementation-detection -- similar patterns across diagnostic modules
/**
 * @fileoverview Accessibility Icon Rendering Check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/devtools/accessibility-icon-rendering
 * @version 1.0.0
 *
 * Detects files that import accessibility helper functions from theme/helpers
 * but don't use the icon property from the returned config objects.
 *
 * The theme helpers (getAccessibleStatusConfig, getAccessibleSeverityConfig)
 * return objects with an `icon` field that should be rendered alongside
 * status/severity indicators for better visual accessibility.
 */

import { defineCheck, type CheckViolation } from '@opensip-tools/core'

// =============================================================================
// CONSTANTS
// =============================================================================

/** Config functions that return icon-bearing objects */
const ICON_CONFIG_FUNCTIONS = [
  {
    importPattern: /getAccessibleStatusConfig/,
    name: 'getAccessibleStatusConfig',
    iconProperty: '.icon',
  },
  {
    importPattern: /getAccessibleSeverityConfig/,
    name: 'getAccessibleSeverityConfig',
    iconProperty: '.icon',
  },
]

/** Icon map imports that should be rendered */
const ICON_MAP_IMPORTS = [
  { importPattern: /STATUS_ICONS/, name: 'STATUS_ICONS' },
  { importPattern: /SEVERITY_ICONS/, name: 'SEVERITY_ICONS' },
]

// =============================================================================
// DETECTION HELPERS
// =============================================================================

/**
 * Find the line index where an import matching the given pattern exists.
 * Returns -1 if not found.
 */
function findImportLine(lines: string[], pattern: RegExp): number {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (line.includes('import ') && pattern.test(line)) return i
  }
  return -1
}

/**
 * Check if .icon is referenced anywhere in the file outside imports/comments.
 */
function hasIconUsageInCode(lines: string[], iconProperty: string): boolean {
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('import ') || trimmed.startsWith('//') || trimmed.startsWith('*')) {
      continue
    }
    if (
      line.includes(iconProperty) ||
      /\.\s*icon\b/.test(line) ||
      // eslint-disable-next-line sonarjs/slow-regex -- two [^}]* segments separated by literal 'icon'; bounded by braces
      /\{[^}]*\bicon\b[^}]*\}/.test(line)
    ) {
      return true
    }
  }
  return false
}

/**
 * Check if an icon map is rendered in JSX (not just imported).
 */
function hasJsxRenderingOfMap(lines: string[], mapName: string): boolean {
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('import ') || trimmed.startsWith('//') || trimmed.startsWith('*')) {
      continue
    }
    if (
      new RegExp(`\\{\\s*${mapName}\\s*\\[`).test(line) ||
      new RegExp(`${mapName}\\.get\\(`).test(line) ||
      new RegExp(`${mapName}\\[`).test(line)
    ) {
      return true
    }
  }
  return false
}

// =============================================================================
// DETECTION
// =============================================================================

/**
 * Analyze a file for imported but unused accessibility icon helpers.
 */
function analyzeFile(content: string, _filePath: string): CheckViolation[] {
  const violations: CheckViolation[] = []
  const lines = content.split('\n')

  // Check for config function imports
  for (const { importPattern, name, iconProperty } of ICON_CONFIG_FUNCTIONS) {
    const importLine = findImportLine(lines, importPattern)
    if (importLine === -1) continue

    if (!hasIconUsageInCode(lines, iconProperty)) {
      violations.push({
        type: 'unused-accessibility-icon',
        line: importLine + 1,
        message: `${name}() is imported but .icon is never rendered — accessibility icons should be displayed`,
        severity: 'warning',
        suggestion:
          `Render the .icon property from ${name}() alongside the status/severity indicator. ` +
          'Icons provide visual differentiation beyond color for colorblind users.',
        match: (lines[importLine] ?? '').trim().slice(0, 120),
      })
    }
  }

  // Check for icon map imports
  for (const { importPattern, name } of ICON_MAP_IMPORTS) {
    const importLine = findImportLine(lines, importPattern)
    if (importLine === -1) continue

    if (!hasJsxRenderingOfMap(lines, name)) {
      violations.push({
        type: 'unused-icon-map',
        line: importLine + 1,
        message: `${name} is imported but never rendered — icons should be displayed alongside status indicators`,
        severity: 'warning',
        suggestion:
          `Render icons from ${name} next to their corresponding status/severity labels. ` +
          'This improves accessibility by providing non-color visual differentiation.',
        match: (lines[importLine] ?? '').trim().slice(0, 120),
      })
    }
  }

  return violations
}

// =============================================================================
// CHECK DEFINITION
// =============================================================================

/**
 * Check: quality/accessibility-icon-rendering
 *
 * Ensures accessibility icon helpers are actually rendered, not just imported.
 */
export const accessibilityIconRendering = defineCheck({
  id: '1836b8de-ecd6-4d32-8029-d0e1585f1996',
  slug: 'accessibility-icon-rendering',
  disabled: true,
  scope: { languages: ['typescript', 'tsx'], concerns: ['frontend', 'ui'] },
  contentFilter: 'code-only',

  confidence: 'medium',
  description:
    'Detects imported accessibility icon helpers that are not rendered — icons should be displayed for colorblind users',
  longDescription: `**Purpose:** Ensures accessibility icon helpers are actually rendered in the UI, not just imported.

**Detects:**
- \`getAccessibleStatusConfig\` or \`getAccessibleSeverityConfig\` imported but \`.icon\` never referenced in code
- \`STATUS_ICONS\` or \`SEVERITY_ICONS\` imported but never rendered via bracket access or \`.get()\`

**Why it matters:** Icons provide visual differentiation beyond color for colorblind users. Importing helpers without rendering their icons defeats the purpose of the accessibility system.

**Scope:** Codebase-specific convention. Analyzes each file individually.`,
  tags: ['quality', 'devtools', 'accessibility', 'icons', 'a11y'],
  fileTypes: ['ts', 'tsx'],

  analyze: analyzeFile,
})
