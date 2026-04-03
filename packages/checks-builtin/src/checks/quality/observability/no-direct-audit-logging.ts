// @fitness-ignore-file no-direct-audit-logging -- Pattern string in fitness check definition; not actual audit repository usage
/**
 * @fileoverview No Direct Audit Logging Check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/observability/no-direct-audit-logging
 * @version 2.0.0
 * @see ADR-058 (Centralized Audit Logging)
 *
 * Enforces use of centralized AuditLogger instead of direct repository access.
 */

import { defineCheck, type CheckViolation } from '@opensip-tools/core'
import { isCommentLine } from '../../../utils/index.js'


/**
 * Paths that are allowed to use direct audit APIs
 */
const AUDIT_IMPL_PATTERNS = [
  /infrastructure\/audit\//,
  /infrastructure\/di-registration\//,
  /infrastructure\/security\/adapters\//,
]

/**
 * Patterns that indicate direct audit repository usage.
 * These are simple string-based patterns to avoid regex safety warnings.
 */
const DIRECT_REPOSITORY_PATTERN_STRINGS = [
  'new MemoryAuditRepository(',
  'new DynamoDBAuditRepository(',
  'new S3AuditRepository(',
  '.saveEvent(',
  '.saveBatch(',
] as const

/**
 * Patterns for legacy audit imports (as strings for safer matching)
 */
const LEGACY_IMPORT_PATTERN_STRINGS = [
  '@backend/platform/infrastructure/security',
  '@backend/platform/infrastructure/audit/adapters',
] as const

/**
 * Patterns for manual audit event creation (as strings for safer matching)
 */
const MANUAL_EVENT_PATTERNS = [
  'AuditEventBuilder()',
  'createAuditEventBuilder(',
  "eventType: 'USER_ACTION'",
  'eventType: "USER_ACTION"',
  "eventType: 'DATA_ACCESS'",
  'eventType: "DATA_ACCESS"',
] as const

/**
 * Check if a line matches a direct repository pattern
 * @param {string} line - The line to check
 * @returns {{ matched: boolean; pattern: string | null }} Match result
 */
function matchDirectRepositoryPattern(line: string): { matched: boolean; pattern: string | null } {
  // Normalize whitespace for matching
  const normalized = line.replace(/\s+/g, ' ')
  for (const pattern of DIRECT_REPOSITORY_PATTERN_STRINGS) {
    if (normalized.includes(pattern.replace(/\s+/g, ' '))) {
      return { matched: true, pattern }
    }
  }
  return { matched: false, pattern: null }
}

/**
 * Check if a line matches a legacy import pattern
 * @param {string} line - The line to check
 * @returns {{ matched: boolean; pattern: string | null }} Match result
 */
function matchLegacyImportPattern(line: string): { matched: boolean; pattern: string | null } {
  // Only match import/from lines
  if (!line.includes('from') && !line.includes('import')) {
    return { matched: false, pattern: null }
  }

  for (const pattern of LEGACY_IMPORT_PATTERN_STRINGS) {
    if (line.includes(pattern) && line.includes('AuditRepository')) {
      return { matched: true, pattern }
    }
  }
  return { matched: false, pattern: null }
}

/**
 * Check if a line matches a manual event pattern
 * @param {string} line - The line to check
 * @returns {{ matched: boolean; pattern: string | null }} Match result
 */
function matchManualEventPattern(line: string): { matched: boolean; pattern: string | null } {
  for (const pattern of MANUAL_EVENT_PATTERNS) {
    if (line.includes(pattern)) {
      return { matched: true, pattern }
    }
  }
  return { matched: false, pattern: null }
}

/**
 * Create a violation for direct repository usage
 */
function createDirectRepoViolation(
  lineNumber: number,
  _line: string,
  pattern: string,
): CheckViolation {
  return {
    line: lineNumber,
    column: 0,
    message: 'Direct audit repository usage detected',
    severity: 'warning',
    type: 'direct-repository',
    suggestion:
      'Use AuditLogger from DI instead of direct repository access. Inject IAuditLogger and call logUserAction(), logDataAccess(), etc.',
    match: pattern,
  }
}

/**
 * Create a violation for legacy imports
 */
function createLegacyImportViolation(
  lineNumber: number,
  _line: string,
  pattern: string,
): CheckViolation {
  return {
    line: lineNumber,
    column: 0,
    message: 'Legacy audit import detected',
    severity: 'warning',
    type: 'legacy-import',
    suggestion:
      "Replace with: import { IAuditLogger } from '@backend/platform/infrastructure/audit'",
    match: pattern,
  }
}

/**
 * Create a violation for manual event creation
 */
function createManualEventViolation(
  lineNumber: number,
  _line: string,
  pattern: string,
): CheckViolation {
  return {
    line: lineNumber,
    column: 0,
    message: 'Manual audit event creation in services',
    severity: 'warning',
    type: 'manual-event',
    suggestion:
      'Use AuditLogger helper methods: logUserAction(), logDataAccess(), logSystemEvent(), etc. instead of manual event creation.',
    match: pattern,
  }
}

/**
 * Process a single line and return any violations found
 */
function processLine(
  line: string,
  lineNumber: number,
  isServiceFile: boolean,
): CheckViolation | null {
  // Check direct repository patterns
  const directMatch = matchDirectRepositoryPattern(line)
  if (directMatch.matched && directMatch.pattern) {
    return createDirectRepoViolation(lineNumber, line, directMatch.pattern)
  }

  // Check legacy import patterns
  const legacyMatch = matchLegacyImportPattern(line)
  if (legacyMatch.matched && legacyMatch.pattern) {
    return createLegacyImportViolation(lineNumber, line, legacyMatch.pattern)
  }

  // Check manual event patterns (services only)
  if (isServiceFile) {
    const manualMatch = matchManualEventPattern(line)
    if (manualMatch.matched && manualMatch.pattern) {
      return createManualEventViolation(lineNumber, line, manualMatch.pattern)
    }
  }

  return null
}

/**
 * Analyze a file for direct audit logging
 */
function analyzeFile(content: string, filePath: string): CheckViolation[] {
  const violations: CheckViolation[] = []

  // Skip allowed paths
  if (AUDIT_IMPL_PATTERNS.some((pattern) => pattern.test(filePath))) {
    return violations
  }

  // Quick filter: skip files without audit-related patterns
  if (!content.includes('Audit') && !content.includes('audit')) {
    return violations
  }

  const lines = content.split('\n')
  const isServiceFile = filePath.includes('/services/')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line || isCommentLine(line, { includeBlockStart: true })) {
      continue
    }

    const violation = processLine(line, i + 1, isServiceFile)
    if (violation) {
      violations.push(violation)
    }
  }

  return violations
}

/**
 * Check: quality/no-direct-audit-logging
 *
 * Enforces use of centralized AuditLogger instead of direct repository access.
 */
export const noDirectAuditLogging = defineCheck({
  id: 'cff4de91-6dd5-451e-85b3-3073f97a3ca5',
  slug: 'no-direct-audit-logging',
  disabled: true,
  scope: { languages: ['typescript'], concerns: ['backend', 'server'] },
  contentFilter: 'raw',

  confidence: 'medium',
  description: 'Enforce use of centralized AuditLogger instead of direct repository access',
  longDescription: `**Purpose:** Enforces use of the centralized \`AuditLogger\` (via DI) instead of direct audit repository instantiation or manual audit event creation, per ADR-058.

**Detects:**
- Direct audit repository instantiation: \`new MemoryAuditRepository(\`, \`new DynamoDBAuditRepository(\`, \`new S3AuditRepository(\`, \`.saveEvent(\`, \`.saveBatch(\`
- Legacy audit imports from \`@backend/platform/infrastructure/security\` or \`@backend/platform/infrastructure/audit/adapters\` that reference \`AuditRepository\`
- Manual audit event creation in service files: \`AuditEventBuilder()\`, \`createAuditEventBuilder(\`, and hardcoded \`eventType\` values like \`'USER_ACTION'\` or \`'DATA_ACCESS'\`
- Skips allowed paths: \`infrastructure/audit/\`, \`infrastructure/di-registration/\`, \`infrastructure/security/adapters/\`, and test files

**Why it matters:** Bypassing the centralized audit logger creates inconsistent audit trails, risks missing required fields, and makes compliance auditing unreliable.

**Scope:** Codebase-specific convention enforcing ADR-058. Analyzes each file individually.`,
  tags: ['quality', 'security', 'compliance', 'architecture'],
  fileTypes: ['ts'],

  analyze: analyzeFile,
})
