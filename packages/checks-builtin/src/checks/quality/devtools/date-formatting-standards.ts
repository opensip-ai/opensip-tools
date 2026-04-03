/**
 * @fileoverview Date Formatting Standards Check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/devtools/date-formatting-standards
 * @version 2.0.0
 *
 * Enforces centralized date formatting in the DevTools portal:
 * - No inline date formatting (.toLocaleDateString, .toLocaleTimeString, .toLocaleString)
 * - No direct @/lib/date-utils imports in pages/components (use useDateFormat hook)
 * - No inline Intl.DateTimeFormat construction in page files
 *
 * Allowed exceptions:
 * - formatDateUTCFull and formatDuration are timezone-independent (direct import OK)
 * - useDateFormat.ts and useFitnessSessions.ts legitimately import from date-utils
 * - ActivityChart.tsx uses Intl.DateTimeFormat for timezone-aware day bucketing
 * - date-utils.ts itself
 * - Test files
 */

import { defineCheck, type CheckViolation } from '@opensip-tools/core'

// =============================================================================
// CONSTANTS
// =============================================================================

/** Files that legitimately import directly from date-utils */
const DATE_UTIL_IMPL_FILES = [
  'hooks/useDateFormat.ts',
  'hooks/useFitnessSessions.ts',
  'lib/date-utils.ts',
  'lib/__tests__/date-utils.test.ts',
]

/** Files that legitimately use Intl.DateTimeFormat */
const INTL_DIRECT_USE_FILES = [
  'components/charts/ActivityChart.tsx',
  'components/shared/TimezoneToggle.tsx',
  'lib/date-utils.ts',
]

/** Timezone-independent functions that don't need the hook */
const TIMEZONE_INDEPENDENT_FUNCTIONS = ['formatDateUTCFull', 'formatDuration']

// =============================================================================
// VIOLATION TYPES
// =============================================================================

type ViolationType =
  | 'inline-date-formatting'
  | 'direct-date-utils-import'
  | 'inline-intl-datetimeformat'

// =============================================================================
// DETECTION HELPERS
// =============================================================================

/**
 * Detect inline date formatting calls:
 * - .toLocaleDateString(
 * - .toLocaleTimeString(
 * - .toLocaleString( on date-like expressions
 * - new Date(...).toISOString().replace( (custom formatting)
 */
function detectInlineDateFormatting(lines: string[]): CheckViolation[] {
  const violations: CheckViolation[] = []

  const patterns = [
    {
      regex: /\.toLocaleDateString\s*\(/,
      message: 'Inline .toLocaleDateString() - use useDateFormat() hook',
    },
    {
      regex: /\.toLocaleTimeString\s*\(/,
      message: 'Inline .toLocaleTimeString() - use useDateFormat() hook',
    },
    {
      // Only match .toLocaleString() when preceded by date-like context
      regex: /(?:date|Date|time|Time|created|updated|At)\)?\.toLocaleString\s*\(/,
      message: 'Inline .toLocaleString() on date value - use useDateFormat() hook',
    },
  ]

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()

    // Skip comments and imports
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('import ')) {
      continue
    }

    for (const { regex, message } of patterns) {
      if (regex.test(line)) {
        violations.push({
          type: 'inline-date-formatting' as ViolationType,
          line: i + 1,
          message,
          severity: 'warning',
          suggestion:
            'Use the useDateFormat() hook: const { formatDate } = useDateFormat(). ' +
            'Import from @/hooks/useDateFormat',
          match: trimmed.slice(0, 120),
        })
        break // Only report once per line
      }
    }
  }

  return violations
}

/**
 * Detect direct imports of timezone-dependent functions from @/lib/date-utils.
 * These should use the useDateFormat hook instead for timezone awareness.
 *
 * Allowed: formatDateUTCFull, formatDuration (timezone-independent)
 */
function detectDirectDateUtilsImports(lines: string[]): CheckViolation[] {
  const violations: CheckViolation[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''

    // Match: import { ... } from '@/lib/date-utils'
    const importMatch = line.match(/import\s+\{([^}]+)\}\s+from\s+['"]@\/lib\/date-utils['"]/)
    if (!importMatch) continue

    const importList = importMatch[1]
    if (!importList) continue

    const importedNames = importList
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)

    // Check if any imported function is timezone-dependent
    const tzDependentImports = importedNames.filter(
      (name) => !TIMEZONE_INDEPENDENT_FUNCTIONS.includes(name),
    )

    if (tzDependentImports.length > 0) {
      violations.push({
        type: 'direct-date-utils-import' as ViolationType,
        line: i + 1,
        message:
          `Direct import of timezone-dependent function(s): ${tzDependentImports.join(', ')}. ` +
          'Use useDateFormat() hook instead',
        severity: 'warning',
        suggestion:
          `Replace with: import { useDateFormat } from '@/hooks/useDateFormat' ` +
          `then: const { ${tzDependentImports.join(', ')} } = useDateFormat()`,
        match: line.trim(),
      })
    }
  }

  return violations
}

/**
 * Detect inline Intl.DateTimeFormat construction in page files.
 * Should use centralized date-utils or useDateFormat hook.
 */
function detectInlineIntlDateTimeFormat(lines: string[]): CheckViolation[] {
  const violations: CheckViolation[] = []
  const pattern = /new\s+Intl\.DateTimeFormat\s*\(/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()

    // Skip comments
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue

    if (pattern.test(line)) {
      violations.push({
        type: 'inline-intl-datetimeformat' as ViolationType,
        line: i + 1,
        message: 'Inline Intl.DateTimeFormat - use useDateFormat() hook or date-utils',
        severity: 'warning',
        suggestion:
          'Use the centralized date formatting from @/hooks/useDateFormat. ' +
          'If you need custom formatting, add a function to @/lib/date-utils.ts',
        match: trimmed.slice(0, 120),
      })
    }
  }

  return violations
}

// =============================================================================
// ANALYSIS FUNCTION
// =============================================================================

/**
 * Analyze a single file for date formatting violations.
 */
function analyzeFile(content: string, filePath: string): CheckViolation[] {
  const lines = content.split('\n')
  const allViolations: CheckViolation[] = []

  // Rule 1: Inline date formatting
  allViolations.push(...detectInlineDateFormatting(lines))

  // Rule 2: Direct date-utils imports (skip allowed files)
  if (!DATE_UTIL_IMPL_FILES.some((allowed) => filePath.endsWith(allowed))) {
    allViolations.push(...detectDirectDateUtilsImports(lines))
  }

  // Rule 3: Inline Intl.DateTimeFormat (skip allowed files)
  if (!INTL_DIRECT_USE_FILES.some((allowed) => filePath.endsWith(allowed))) {
    allViolations.push(...detectInlineIntlDateTimeFormat(lines))
  }

  return allViolations
}

// =============================================================================
// CHECK DEFINITION
// =============================================================================

/**
 * Check: quality/date-formatting-standards
 *
 * Enforces centralized date formatting in the DevTools portal.
 */
export const dateFormattingStandards = defineCheck({
  id: '72b43b7f-d468-4567-ac0f-1baf81ecf15c',
  slug: 'date-formatting-standards',
  disabled: true,
  scope: { languages: ['typescript', 'tsx'], concerns: ['frontend', 'ui'] },
  contentFilter: 'code-only',

  confidence: 'medium',
  description:
    'Enforces centralized date formatting: useDateFormat hook, no inline toLocaleString/Intl.DateTimeFormat',
  longDescription: `**Purpose:** Enforces centralized, timezone-aware date formatting through the \`useDateFormat()\` hook.

**Detects:**
- Inline \`.toLocaleDateString()\`, \`.toLocaleTimeString()\`, or \`.toLocaleString()\` on date-like values
- Direct imports of timezone-dependent functions from \`@/lib/date-utils\` (excluding \`formatDateUTCFull\` and \`formatDuration\`)
- Inline \`new Intl.DateTimeFormat()\` construction outside allowlisted files

**Why it matters:** Scattered date formatting leads to inconsistent timezone handling and display formats. Centralizing through a hook ensures consistent user-facing date presentation.

**Scope:** Codebase-specific convention. Analyzes each file individually.`,
  tags: ['quality', 'devtools', 'dates', 'consistency', 'timezone'],
  fileTypes: ['ts', 'tsx'],

  analyze: analyzeFile,
})
