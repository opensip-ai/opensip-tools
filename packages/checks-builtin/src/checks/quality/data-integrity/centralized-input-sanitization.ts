// @fitness-ignore-file unused-config-options -- Config options reserved for future use or environment-specific
/**
 * @fileoverview ADR-048: Centralized Input Sanitization Enforcement
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/data-integrity/centralized-input-sanitization
 * @version 2.0.0
 * @see ADR-048 - Centralized Input Sanitization
 *
 * This check enforces usage of @backend/platform/infrastructure/input-sanitization
 * and forbids direct low-level string validation utilities at boundaries.
 *
 * The centralized sanitizer provides:
 * - Consistent threat detection across the codebase
 * - Unified validation patterns
 * - Single point for security updates
 */

import { defineCheck, type CheckViolation } from '@opensip-tools/core'

// =============================================================================
// CONSTANTS
// =============================================================================

// The canonical input sanitization module
const INPUT_SANITIZATION_IMPORT = '@backend/platform/infrastructure/input-sanitization'

// The low-level validation utils that should not be imported directly
const STORAGE_VALIDATION_IMPORT = '@backend/platform/infrastructure/storage/utils/validation'

// Paths to exclude from checking (the modules that define these utilities)
const SANITIZATION_IMPL_PATHS = ['/input-sanitization/', '/storage/utils/validation']

// =============================================================================
// TYPES
// =============================================================================

interface ImportInfo {
  hasStorageValidation: boolean
  hasInputSanitizer: boolean
}

// =============================================================================
// ANALYSIS FUNCTIONS
// =============================================================================

/**
 * @param {*} filePath
 * @returns {*}
 * Check if a file should be excluded from checking
 */
function shouldExcludeFile(filePath: string): boolean {
  return SANITIZATION_IMPL_PATHS.some((p) => filePath.includes(p))
}

/**
 * Analyze file for input sanitization violations
 */
function analyzeFileImports(content: string): ImportInfo {
  return {
    hasStorageValidation: content.includes(STORAGE_VALIDATION_IMPORT),
    hasInputSanitizer: content.includes(INPUT_SANITIZATION_IMPORT),
  }
}

/**
 * Check if file has input sanitization violation
 */
function hasViolation(importInfo: ImportInfo): boolean {
  // Violation: imports low-level validation utils without centralized sanitizer
  return importInfo.hasStorageValidation && !importInfo.hasInputSanitizer
}

/**
 * Find the line number where the storage validation import occurs
 */
function findImportLineNumber(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.includes(STORAGE_VALIDATION_IMPORT)) {
      return i + 1
    }
  }
  return 1
}

/**
 * Analyze a single file for centralized input sanitization violations
 */
function analyzeFile(content: string, filePath: string): CheckViolation[] {
  const violations: CheckViolation[] = []

  // Skip excluded files
  if (shouldExcludeFile(filePath)) {
    return violations
  }

  // Quick filter: skip files without relevant imports
  if (!content.includes(STORAGE_VALIDATION_IMPORT)) {
    return violations
  }

  const importInfo = analyzeFileImports(content)
  if (!hasViolation(importInfo)) {
    return violations
  }

  const lines = content.split('\n')
  const importLine = findImportLineNumber(lines)

  violations.push({
    line: importLine,
    column: 0,
    message: `File imports low-level validation utils (${STORAGE_VALIDATION_IMPORT}) but is missing centralized sanitizer (${INPUT_SANITIZATION_IMPORT}). Use the centralized sanitizer for threat detection (ADR-048).`,
    severity: 'error',
    type: 'MISSING_CENTRALIZED_SANITIZER',
    suggestion: `Replace import from '${STORAGE_VALIDATION_IMPORT}' with '${INPUT_SANITIZATION_IMPORT}' which provides consistent threat detection and validation patterns per ADR-048`,
    match: STORAGE_VALIDATION_IMPORT,
  })

  return violations
}

// =============================================================================
// CHECK DEFINITION
// =============================================================================

/**
 * Check: quality/centralized-input-sanitization
 *
 * Enforces usage of @backend/platform/infrastructure/input-sanitization
 * and forbids direct low-level string validation utilities at boundaries.
 *
 * @see ADR-048 Centralized Input Sanitization
 */
export const centralizedInputSanitization = defineCheck({
  id: 'c3ddf850-a02f-496e-b316-96c2f911873b',
  slug: 'centralized-input-sanitization',
  scope: { languages: ['typescript'], concerns: ['backend', 'server'] },

  confidence: 'medium',
  description:
    'Enforces usage of centralized input sanitization and forbids direct low-level validation utilities',
  longDescription: `**Purpose:** Enforces that boundary code uses the centralized input sanitization module instead of importing low-level string validation utilities directly.

**Detects:**
- Files that import \`@backend/platform/infrastructure/storage/utils/validation\` without also importing \`@backend/platform/infrastructure/input-sanitization\`
- Excludes files within the sanitization and validation modules themselves (\`/input-sanitization/\`, \`/storage/utils/validation\`)

**Why it matters:** Bypassing the centralized sanitizer means threat detection logic is scattered across the codebase, making security updates inconsistent and error-prone.

**Scope:** Codebase-specific convention enforcing ADR-048. Analyzes each file individually.`,
  tags: ['architecture', 'security', 'adr-048', 'quality'],
  fileTypes: ['ts'],
  docs: 'docs/adr/048-centralized-input-sanitization.md',

  analyze: analyzeFile,
})
