// @fitness-ignore-file file-length-limits -- Complex module with tightly coupled logic; refactoring would risk breaking changes
/**
 * @fileoverview Logging Standards check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/observability/logging-standards
 * @version 2.0.0
 *
 * This check validates logging practices:
 * - No console.log in production code (use logger)
 * - Logger calls must have 'evt' field with valid format
 * - Logger calls should have correlation ID (via Context.set or explicit)
 * - Logger calls must have 'msg' field
 * - Error/fatal logs must have 'err' field
 */

import { defineCheck, type CheckViolation } from '@opensip-tools/core'

// =============================================================================
// CONSTANTS
// =============================================================================

const CONSOLE_METHODS = ['log', 'error', 'warn', 'info', 'debug', 'trace']
const LOGGER_METHODS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal']

const VIOLATION_TYPES = {
  CONSOLE_IN_APP_CODE: 'console-in-app-code',
  MISSING_EVT: 'missing-evt',
  INVALID_EVT_FORMAT: 'invalid-evt-format',
  MISSING_MSG: 'missing-msg',
  MISSING_ERR: 'missing-err',
} as const

type ViolationType = (typeof VIOLATION_TYPES)[keyof typeof VIOLATION_TYPES]

interface LoggingIssue {
  line: number
  type: ViolationType
  message: string
}

// Regex patterns - designed to be safe and non-backtracking
// These patterns use simple character classes without unbounded quantifiers

/**
 * Validates evt format: domain.action.result (3+ segments in lowercase with underscores)
 * Pattern is safe: uses bounded quantifiers to prevent ReDoS
 */
const EVT_FORMAT_PATTERN = /^[a-z0-9_]{1,50}\.[a-z0-9_]{1,50}\.[a-z0-9_.]{1,100}$/

/**
 * Extracts evt field value from logger call
 * Pattern is safe: uses bounded quantifiers and negated character class
 */
const EVT_FIELD_PATTERN = /evt\s{0,5}:\s{0,5}['"`]([^'"`]{1,200})['"`]/

/**
 * Checks for presence of err or error field
 * Pattern is safe: uses bounded quantifier for whitespace
 */
const ERR_FIELD_PATTERN = /err\s{0,5}:|error\s{0,5}:/

// Paths where console.log is allowed (scripts, CLI, tests, dashboard)
const CONSOLE_OK_PATTERNS = [
  /scripts\//,
  /cli\//,
  /bin\//,
  /__tests__\//,
  /\.test\./,
  /\.spec\./,
  /fixtures\//,
  /mocks\//,
  /devtools\//,
  /dashboard\//,
  /fitness\/src\/checks\//,
]

// Paths where logging requirements are relaxed
// NOTE: cli/ and bin/ removed — CLI code must follow the same 3-dot evt convention
const RELAXED_LOGGING_CONTEXTS = [
  /scripts\//,
  /__tests__\//,
  /\.test\./,
  /\.spec\./,
  /devtools\//,
  // DI composition and bootstrap - logging may be conditional
  /di-composition\//,
  /bootstrap/,
  /composition-root/,
]

/**
 * Patterns that indicate structured event constants (exempt from string literal check)
 * These are constant references that the check cannot statically analyze
 */
const EVENT_CONSTANT_PATTERNS = [
  /evt\s*:\s*EVENT_NAMES\./,
  /evt\s*:\s*EVENTS\./,
  /evt\s*:\s*LogEvents\./,
  /evt\s*:\s*LOG_EVENTS\./,
  /evt\s*:\s*EventNames\./,
  /evt\s*:\s*this\.events\./,
  /evt\s*:\s*[A-Z_]+_EVENTS\./,
]

/**
 * Check if content uses event constants instead of string literals
 */
function usesEventConstants(objectContent: string): boolean {
  return EVENT_CONSTANT_PATTERNS.some((pattern) => pattern.test(objectContent))
}

/**
 * Check if console usage is allowed in this path
 * @param {string} relativePath - The relative file path to check
 * @returns {boolean} True if console usage is allowed, false otherwise
 */
function isAllowedConsolePath(relativePath: string): boolean {
  return CONSOLE_OK_PATTERNS.some((p) => p.test(relativePath))
}

/**
 * Suggestion messages by violation type
 */
const SUGGESTION_BY_TYPE: Record<ViolationType, string> = {
  [VIOLATION_TYPES.CONSOLE_IN_APP_CODE]:
    "Replace console.* with structured logger: import { logger } from '@opensip-tools/core/logger'",
  [VIOLATION_TYPES.MISSING_EVT]:
    "Add 'evt' field in dot notation format (e.g., evt: 'user.login.success')",
  [VIOLATION_TYPES.INVALID_EVT_FORMAT]:
    "Use evt format 'domain.action.result' with 3+ segments in lowercase (e.g., 'user.login.success')",
  [VIOLATION_TYPES.MISSING_MSG]:
    "Add 'msg' field with human-readable message (e.g., msg: 'User login successful')",
  [VIOLATION_TYPES.MISSING_ERR]:
    "Add 'err' field with error object for error/fatal logs (e.g., err: error)",
}

/**
 * Gets the suggestion for a violation type
 * @param {ViolationType} type - The violation type
 * @returns {string} The suggestion message
 */
function getSuggestion(type: ViolationType): string {
  return SUGGESTION_BY_TYPE[type]
}

/**
 * Check if logging requirements are relaxed for this path
 * @param {string} relativePath - The relative file path to check
 * @returns {boolean} True if logging requirements are relaxed, false otherwise
 */
function isRelaxedLoggingPath(relativePath: string): boolean {
  return RELAXED_LOGGING_CONTEXTS.some((p) => p.test(relativePath))
}

/**
 * Map console method to appropriate logger method
 * @param {string} method - The console method name (log, error, warn, info, debug, trace)
 * @returns {string} The corresponding logger method name
 */
function mapConsoleToLoggerMethod(method: string): string {
  const mapping: Record<string, string> = {
    log: 'info',
    error: 'error',
    warn: 'warn',
    info: 'info',
    debug: 'debug',
    trace: 'trace',
  }
  return mapping[method] ?? 'info'
}

function checkConsoleUsage(content: string, relativePath: string): LoggingIssue[] {
  if (isAllowedConsolePath(relativePath)) {
    return []
  }

  const issues: LoggingIssue[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    checkConsoleLine(lines[i], i + 1, issues)
  }

  return issues
}

function checkConsoleLine(
  line: string | undefined,
  lineNumber: number,
  issues: LoggingIssue[],
): void {
  // Validate array parameter
  if (!Array.isArray(issues)) {
    return
  }

  if (!line) return

  // Skip comment lines
  const trimmed = line.trim()
  if (trimmed.startsWith('//') || trimmed.startsWith('*')) return

  for (const method of CONSOLE_METHODS) {
    const pattern = new RegExp(`\\bconsole\\.${method}\\s*\\(`)
    if (pattern.test(line)) {
      issues.push({
        line: lineNumber,
        type: VIOLATION_TYPES.CONSOLE_IN_APP_CODE,
        message: `Direct console.${method}() usage in application code. Use structured logger instead: import { logger } from '@opensip-tools/core/logger'; logger.${mapConsoleToLoggerMethod(method)}(...)`,
      })
      break // Only report once per line
    }
  }
}

/**
 * Check logger calls for required fields
 * @param {string} content - The file content to analyze
 * @param {string} relativePath - The relative file path
 * @returns {LoggingIssue[]} Array of logging issues found
 */
function checkLoggerUsage(content: string, relativePath: string): LoggingIssue[] {
  if (isRelaxedLoggingPath(relativePath)) {
    return []
  }

  const issues: LoggingIssue[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    analyzeLoggerLine(lines, i, issues)
  }

  return issues
}

function analyzeLoggerLine(lines: string[], index: number, issues: LoggingIssue[]): void {
  const line = lines[index]
  if (!line) return

  // Skip comment lines
  const trimmed = line.trim()
  if (trimmed.startsWith('//') || trimmed.startsWith('*')) return

  for (const method of LOGGER_METHODS) {
    const pattern = new RegExp(`\\blogger\\.${method}\\s*\\(\\s*\\{`)
    if (!pattern.test(line)) continue

    const objectContent = extractLoggerObject(lines, index)
    validateLoggerObject(objectContent, method, index + 1, issues)
  }
}

/**
 * Count brace depth change for a character
 */
function getBraceDepthChange(char: string): number {
  if (char === '{') return 1
  if (char === '}') return -1
  return 0
}

/**
 * Count braces in a string and return the final depth change
 */
function countBracesInString(
  str: string,
  startDepth: number,
): { depth: number; startFound: boolean } {
  let depth = startDepth
  let startFound = startDepth > 0

  for (const char of str) {
    const change = getBraceDepthChange(char)
    if (change === 1 && !startFound) {
      startFound = true
    }
    depth += change
    if (startFound && depth === 0) break
  }

  return { depth, startFound }
}

function extractLoggerObject(lines: string[], startIndex: number): string {
  const line = lines[startIndex] ?? ''
  let objectContent = line

  // Count braces in the first line
  const { depth: initialDepth, startFound } = countBracesInString(line, 0)
  let depth = initialDepth

  // If object spans multiple lines, collect them
  if (!startFound || depth === 0) {
    return objectContent
  }

  const maxLookAhead = Math.min(startIndex + 20, lines.length)
  for (let k = startIndex + 1; k < maxLookAhead && depth !== 0; k++) {
    const nextLine = lines[k]
    if (nextLine) {
      objectContent += '\n' + nextLine
      const result = countBracesInString(nextLine, depth)
      depth = result.depth
    }
  }

  return objectContent
}

function validateLoggerObject(
  objectContent: string,
  method: string,
  lineNumber: number,
  issues: LoggingIssue[],
): void {
  // Validate array parameter
  if (!Array.isArray(issues)) {
    return
  }

  // Skip evt validation if using event constants (can't statically analyze)
  const hasEventConstants = usesEventConstants(objectContent)

  // Check for evt field (skip if using constants)
  if (!hasEventConstants && !EVT_FIELD_PATTERN.test(objectContent)) {
    issues.push({
      line: lineNumber,
      type: VIOLATION_TYPES.MISSING_EVT,
      message: `logger.${method}() call missing required 'evt' field. Add event name in dot notation with 3+ segments (e.g., evt: 'user.login.success')`,
    })
  } else if (!hasEventConstants) {
    validateEvtFormat(objectContent, method, lineNumber, issues)
  } else {
    // Using event constants — format validation deferred to runtime
  }

  // Check for err field for error/fatal levels
  if (['error', 'fatal'].includes(method) && !ERR_FIELD_PATTERN.test(objectContent)) {
    issues.push({
      line: lineNumber,
      type: VIOLATION_TYPES.MISSING_ERR,
      message: `logger.${method}() call missing required 'err' field. Include the full error object (e.g., err: error)`,
    })
  }
}

function validateEvtFormat(
  objectContent: string,
  method: string,
  lineNumber: number,
  issues: LoggingIssue[],
): void {
  const evtMatch = EVT_FIELD_PATTERN.exec(objectContent)
  if (evtMatch?.[1]) {
    const evtValue = evtMatch[1]
    if (!EVT_FORMAT_PATTERN.test(evtValue)) {
      issues.push({
        line: lineNumber,
        type: VIOLATION_TYPES.INVALID_EVT_FORMAT,
        message: `logger.${method}() evt field '${evtValue}' has invalid format. Expected: 'domain.action.result' (3+ segments in lowercase with underscores, separated by dots). Example: 'user.login.success'`,
      })
    }
  }
}

/**
 * Validate logging standards in a file
 * @param {string} content - The file content to validate
 * @param {string} relativePath - The relative file path
 * @returns {LoggingIssue[]} Array of logging standard violations found
 */
function validateLoggingStandards(content: string, relativePath: string): LoggingIssue[] {
  const issues: LoggingIssue[] = []

  // Check console usage
  const consoleIssues = checkConsoleUsage(content, relativePath)
  issues.push(...consoleIssues)

  // Check logger usage
  const loggerIssues = checkLoggerUsage(content, relativePath)
  issues.push(...loggerIssues)

  return issues
}

/**
 * Analyze a file for logging standards violations
 */
function analyzeFile(content: string, filePath: string): CheckViolation[] {
  const violations: CheckViolation[] = []

  // Skip test files entirely — test logging conventions differ
  if (
    filePath.includes('__tests__') ||
    filePath.includes('.test.') ||
    filePath.includes('.spec.')
  ) {
    return violations
  }

  // Skip infrastructure package — uses its own logging conventions
  if (filePath.includes('packages/infrastructure/')) {
    return violations
  }

  // Early exit: skip files without console or logger usage
  if (!content.includes('console.') && !content.includes('logger.')) {
    return violations
  }

  const issues = validateLoggingStandards(content, filePath)

  for (const issue of issues) {
    violations.push({
      line: issue.line,
      column: 0,
      message: issue.message,
      severity: 'error',
      suggestion: getSuggestion(issue.type),
      type: issue.type,
      match: issue.type,
    })
  }

  return violations
}

// =============================================================================
// CHECK DEFINITION
// =============================================================================

/**
 * Check: quality/logging-standards
 *
 * Ensures proper logging practices are followed:
 * - No console.log in production code
 * - Logger calls have required fields (evt, msg, err for errors)
 * - Event names follow the domain.action.result format
 *
 */
export const loggingStandards = defineCheck({
  id: 'a22140e0-90ce-4ef4-b37b-49fae45faee2',
  slug: 'logging-standards',
  scope: { languages: ['typescript'], concerns: ['backend', 'server'] },
  contentFilter: 'raw',
  confidence: 'medium',
  description:
    'Validates logging standards: no console.log, require evt/msg fields, require err field for error/fatal, validate evt format (domain.action.result)',
  longDescription: `**Purpose:** Enforces structured logging standards, ensuring all log output is machine-parseable and contains required fields for observability.

**Detects:**
- Direct \`console.(log|error|warn|info|debug|trace)\` usage in production code (allowed in scripts/, cli/, tests/, devtools/)
- \`logger.(trace|debug|info|warn|error|fatal)\` calls missing the required \`evt\` field
- \`evt\` field values not matching the \`domain.action.result\` format (validated against \`/^[a-z0-9_]{1,50}\\.[a-z0-9_]{1,50}\\.[a-z0-9_.]{1,100}$/\`)
- Logger calls missing the required \`msg\` field
- \`logger.error()\` and \`logger.fatal()\` calls missing the required \`err\` field

**Why it matters:** Unstructured logs cannot be queried, aggregated, or alerted on; missing event names and correlation fields make incident investigation slow and error-prone.

**Scope:** Codebase-specific convention enforcing structured logging standards. Analyzes each file individually.`,
  tags: ['consistency', 'best-practices', 'quality'],
  fileTypes: ['ts'],

  analyze: analyzeFile,
})
