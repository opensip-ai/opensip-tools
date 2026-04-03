/**
 * @fileoverview DevTools Raw HTML Element Detection
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/devtools/raw-html-elements
 * @version 1.0.0
 *
 * Detects raw HTML elements in page/component files that should use
 * shared components instead:
 * - <table> → DataTable
 * - <input> → Input (from @/components/shared/form)
 * - <select> → Select (from @/components/shared/form)
 * - <textarea> → TextArea (from @/components/shared/form)
 */

import { defineCheck, type CheckViolation } from '@opensip-tools/core'

// =============================================================================
// CONSTANTS
// =============================================================================

/** Files that are allowed to use raw HTML elements (shared component definitions) */
const EXCLUDED_PATTERNS = [
  /\/components\/shared\//, // Shared component implementations themselves
  /\/components\/Pagination/, // Pagination component
  /\/theme\//, // Theme files
]

/** Raw HTML elements to detect and their shared component replacements */
const RAW_ELEMENT_RULES: Array<{
  pattern: RegExp
  element: string
  replacement: string
  importPath: string
}> = [
  {
    pattern: /<table[\s>]/,
    element: '<table>',
    replacement: 'DataTable',
    importPath: '@/components/shared/DataTable',
  },
  {
    pattern: /<input[\s/]/,
    element: '<input>',
    replacement: 'Input',
    importPath: '@/components/shared/form/Input',
  },
  {
    pattern: /<select[\s>]/,
    element: '<select>',
    replacement: 'Select',
    importPath: '@/components/shared/form/Select',
  },
  {
    pattern: /<textarea[\s>/]/,
    element: '<textarea>',
    replacement: 'TextArea',
    importPath: '@/components/shared/form/TextArea',
  },
]

// =============================================================================
// DETECTION
// =============================================================================

/**
 * Detect raw HTML elements that should use shared components.
 */
function detectRawHtmlElements(lines: string[]): CheckViolation[] {
  const violations: CheckViolation[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()

    // Skip comments and imports
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('import ')) {
      continue
    }

    // Skip JSX comment blocks
    if (trimmed.startsWith('{/*')) continue

    for (const rule of RAW_ELEMENT_RULES) {
      if (rule.pattern.test(line)) {
        violations.push({
          type: 'raw-html-element',
          line: i + 1,
          message: `Raw ${rule.element} element — use ${rule.replacement} from ${rule.importPath}`,
          severity: 'warning',
          suggestion: `Replace with the shared ${rule.replacement} component for consistent styling, accessibility, and theme integration`,
          match: trimmed.slice(0, 120),
        })
        break // Only report one violation per line
      }
    }
  }

  return violations
}

// =============================================================================
// ANALYSIS FUNCTION
// =============================================================================

function analyzeFile(content: string, filePath: string): CheckViolation[] {
  // Skip shared component definitions (they legitimately use raw HTML)
  if (EXCLUDED_PATTERNS.some((p) => p.test(filePath))) {
    return []
  }

  const lines = content.split('\n')
  return detectRawHtmlElements(lines)
}

// =============================================================================
// CHECK DEFINITION
// =============================================================================

export const rawHtmlElements = defineCheck({
  id: '3ae513e0-e048-4f42-b470-676576a242c3',
  slug: 'raw-html-elements',
  disabled: true,
  scope: { languages: ['typescript', 'tsx'], concerns: ['frontend', 'ui'] },
  contentFilter: 'code-only',

  confidence: 'medium',
  description:
    'Detects raw <table>, <input>, <select>, <textarea> elements that should use shared components',
  longDescription: `**Purpose:** Enforces usage of shared components instead of raw HTML elements for consistent styling and accessibility.

**Detects:**
- \`<table>\` elements (should use \`DataTable\` from \`@/components/shared/DataTable\`)
- \`<input>\` elements (should use \`Input\` from \`@/components/shared/form/Input\`)
- \`<select>\` elements (should use \`Select\` from \`@/components/shared/form/Select\`)
- \`<textarea>\` elements (should use \`TextArea\` from \`@/components/shared/form/TextArea\`)
- Excludes shared component definition files (\`/components/shared/\`, \`/theme/\`)

**Why it matters:** Raw HTML elements bypass theme integration, consistent styling, and built-in accessibility features provided by shared components.

**Scope:** Codebase-specific convention. Analyzes each file individually.`,
  tags: ['quality', 'devtools', 'ui', 'component-reuse', 'consistency'],
  fileTypes: ['ts', 'tsx'],

  analyze: analyzeFile,
})
