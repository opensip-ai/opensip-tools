// @fitness-ignore-file file-length-limits -- JSDoc documentation required for public API
// @fitness-ignore-file duplicate-utility-functions -- reviewed: line-counting and function-extraction helpers are check-specific analysis logic, not general-purpose utilities
/**
 * @fileoverview ADR-033: File Length Limits check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/code-structure/file-length-limits
 * @version 2.0.0
 * @see ADR-033 - File Length Limits
 *
 * This check ensures files don't exceed logical line limits.
 * Uses AST-based line counting for accurate metrics (excludes blank lines and comments).
 *
 * File limits by type:
 * - Standard (.ts): 700 logical lines
 * - Components (.tsx): 600 logical lines (UI complexity)
 * - Test files: 1200 logical lines (test suites can be longer)
 * - Infrastructure: 1000 logical lines (persistence boilerplate)
 *
 * Function limits:
 * - Standard: 80 logical lines
 * - Handlers: 120 logical lines (event handlers can be slightly longer)
 */

import { logger } from '@opensip-tools/core/logger'

import { defineCheck, type CheckViolation } from '@opensip-tools/core'

// File length limits (logical lines, not raw lines)
const FILE_LIMITS = {
  STANDARD_TS: { warning: 500, error: 700 },
  FOUNDATION_TS: { warning: 300, error: 400 },
  COMPONENT_TSX: { warning: 400, error: 600 },
  // Dashboard pages compose multiple components, manage state, and handle data fetching.
  // They are inherently larger than reusable components.
  PAGE_TSX: { warning: 500, error: 700 },
  TEST_FILE: { warning: 800, error: 1200 },
  // Data-driven files: fitness checks, simulation definitions, schemas, themes, route files, etc.
  // These files contain large pattern/config arrays or multiple handlers that are data, not complex logic.
  DATA_DRIVEN: { warning: 1000, error: 1500 },
  // Infrastructure package files: database adapters, store implementations, migrations.
  // These files contain boilerplate-heavy persistence logic.
  INFRASTRUCTURE: { warning: 800, error: 1000 },
} as const

const FUNCTION_LIMITS = {
  STANDARD: { warning: 60, error: 80 },
  HANDLER: { warning: 80, error: 120 },
} as const

const COMMENT_RATIO = {
  WARNING_RATIO: 0.4, // 40% comments
  WARNING_ABSOLUTE: 150, // 150 comment lines
} as const

const FUNCTION_KEYWORD_PATTERN = /^\s{0,50}(?:async\s{1,10})?function\s{1,10}(\w{1,100})/
const CONST_ARROW_PATTERN =
  /^\s{0,50}(?:export\s{1,10})?(?:const|let)\s{1,10}(\w{1,100})\s{0,10}=\s{0,10}(?:async\s{1,10})?\(/
const CONST_FUNCTION_PATTERN =
  /^\s{0,50}(?:export\s{1,10})?(?:const|let)\s{1,10}(\w{1,100})\s{0,10}=\s{0,10}(?:async\s{1,10})?function/
const CLASS_METHOD_PATTERN =
  /^\s{0,50}(?:public|private|protected)?\s{0,10}(?:async\s{1,10})?(\w{1,100})\s{0,10}\([^)]{0,500}\)\s{0,10}(?::\s{0,10}\w{1,100})?\s{0,10}\{$/

const FUNCTION_PATTERNS = [
  FUNCTION_KEYWORD_PATTERN,
  CONST_ARROW_PATTERN,
  CONST_FUNCTION_PATTERN,
  CLASS_METHOD_PATTERN,
]

const HANDLER_PATTERN = /^(?:handle|on)[A-Z]/i

interface LineCount {
  total: number
  logical: number
  blank: number
  comments: number
}

interface FunctionInfo {
  name: string
  line: number
  logicalLines: number
  isHandler: boolean
}

interface FileLimits {
  warning: number
  error: number
}

type ViolationSeverity = 'WARNING' | 'ERROR'

interface FunctionViolation {
  name: string
  line: number
  logicalLines: number
  severity: ViolationSeverity
  limit: number
}

/** Files containing large pattern/config arrays that are data, not complex logic. */
function isDataDrivenFile(filePath: string): boolean {
  if (filePath.includes('/fitness/src/checks/')) return true
  if (filePath.includes('/simulation/src/recipes/definitions/')) return true
  if (filePath.includes('/database/schema')) return true
  if (filePath.includes('/database/migrate')) return true
  if (filePath.includes('/theme/variants')) return true
  if (filePath.includes('/apiserver/src/routes/')) return true
  return false
}

function isInfrastructureFile(filePath: string): boolean {
  return filePath.includes('/infrastructure/')
}

function isDashboardPage(filePath: string): boolean {
  return filePath.includes('/pages/') && filePath.endsWith('.tsx')
}

function getFileLimits(filePath: string): FileLimits {
  const isTest =
    filePath.includes('.test.') || filePath.includes('.spec.') || filePath.includes('/__tests__/')

  if (isTest) {
    return FILE_LIMITS.TEST_FILE
  }

  if (isDataDrivenFile(filePath)) {
    return FILE_LIMITS.DATA_DRIVEN
  }

  if (isInfrastructureFile(filePath)) {
    return FILE_LIMITS.INFRASTRUCTURE
  }

  if (isDashboardPage(filePath)) {
    return FILE_LIMITS.PAGE_TSX
  }

  if (filePath.endsWith('.tsx')) {
    return FILE_LIMITS.COMPONENT_TSX
  }

  if (filePath.includes('/foundation/src/')) {
    return FILE_LIMITS.FOUNDATION_TS
  }

  return FILE_LIMITS.STANDARD_TS
}

function countLines(content: string): LineCount {
  const lines = content.split('\n')
  const state = {
    logical: 0,
    blank: 0,
    comments: 0,
    inBlockComment: false,
  }

  for (const line of lines) {
    processLineForCount(line, state)
  }

  return {
    total: lines.length,
    logical: state.logical,
    blank: state.blank,
    comments: state.comments,
  }
}

function processLineForCount(
  line: string,
  state: { logical: number; blank: number; comments: number; inBlockComment: boolean },
): void {
  const trimmed = line.trim()

  if (trimmed.startsWith('/*') && !trimmed.includes('*/')) {
    state.inBlockComment = true
    state.comments++
    return
  }

  if (state.inBlockComment) {
    if (trimmed.includes('*/')) {
      state.inBlockComment = false
    }
    state.comments++
    return
  }

  if (trimmed === '') {
    state.blank++
    return
  }

  if (trimmed.startsWith('//')) {
    state.comments++
    return
  }

  if (trimmed.startsWith('/*') && trimmed.endsWith('*/')) {
    state.comments++
    return
  }

  if (trimmed.startsWith('*') && !trimmed.startsWith('*/')) {
    state.comments++
    return
  }

  state.logical++
}

function isHandlerName(name: string): boolean {
  return HANDLER_PATTERN.test(name)
}

function matchFunctionPattern(line: string): string | null {
  for (const pattern of FUNCTION_PATTERNS) {
    const match = pattern.exec(line)
    if (match?.[1]) {
      return match[1]
    }
  }
  return null
}

function isCommentOrBlankLine(trimmed: string): boolean {
  if (trimmed === '') return true
  if (trimmed.startsWith('//')) return true
  if (trimmed.startsWith('*') && !trimmed.startsWith('*/')) return true
  if (trimmed.startsWith('/*') && trimmed.endsWith('*/')) return true
  return false
}

function processFunctionLine(
  line: string,
  state: { depth: number; started: boolean; logicalLines: number; inBlockComment: boolean },
): { shouldBreak: boolean } {
  const trimmed = line.trim()

  if (state.inBlockComment) {
    if (trimmed.includes('*/')) {
      state.inBlockComment = false
    }
    return { shouldBreak: false }
  }

  if (trimmed.startsWith('/*') && !trimmed.includes('*/')) {
    state.inBlockComment = true
    return { shouldBreak: false }
  }

  const isSkippableLine = isCommentOrBlankLine(trimmed)

  for (const char of line) {
    if (char === '{') {
      state.depth++
      state.started = true
    }
    if (char === '}') {
      state.depth--
    }
  }

  if (!isSkippableLine && state.started) {
    state.logicalLines++
  }

  if (state.started && state.depth === 0) {
    return { shouldBreak: true }
  }

  return { shouldBreak: false }
}

function processSingleLineForCount(
  funcLine: string | undefined,
  state: { depth: number; started: boolean; logicalLines: number; inBlockComment: boolean },
): boolean {
  if (!funcLine) return false
  const result = processFunctionLine(funcLine, state)
  return result.shouldBreak
}

function countFunctionLogicalLines(lines: string[], startIndex: number): number {
  const maxLookahead = Math.min(startIndex + 200, lines.length)
  const state = {
    depth: 0,
    started: false,
    logicalLines: 0,
    inBlockComment: false,
  }

  for (let j = startIndex; j < maxLookahead; j++) {
    const shouldStop = processSingleLineForCount(lines[j], state)
    if (shouldStop) return state.logicalLines
  }

  return state.logicalLines
}

function processLineForFunction(
  line: string | undefined,
  lineIndex: number,
  lines: string[],
): FunctionInfo | null {
  if (!line) return null
  if (!Array.isArray(lines)) return null

  const name = matchFunctionPattern(line)
  if (!name) return null

  const isHandler = isHandlerName(name)
  const logicalLines = countFunctionLogicalLines(lines, lineIndex)

  return {
    name,
    line: lineIndex + 1,
    logicalLines,
    isHandler,
  }
}

function extractFunctions(content: string): FunctionInfo[] {
  const functions: FunctionInfo[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const funcInfo = processLineForFunction(lines[i], i, lines)
    if (funcInfo) {
      functions.push(funcInfo)
    }
  }

  return functions
}

function checkFileLength(
  logicalLines: number,
  limits: FileLimits,
): { severity: ViolationSeverity; threshold: number } | null {
  if (logicalLines >= limits.error) {
    return { severity: 'ERROR', threshold: limits.error }
  }
  if (logicalLines >= limits.warning) {
    return { severity: 'WARNING', threshold: limits.warning }
  }
  return null
}

function checkCommentRatio(lineCount: LineCount): { ratio: number; commentLines: number } | null {
  const ratio = lineCount.logical > 0 ? lineCount.comments / lineCount.logical : 0

  const exceedsRatioLimit = ratio > COMMENT_RATIO.WARNING_RATIO
  const exceedsAbsoluteLimit = lineCount.comments > COMMENT_RATIO.WARNING_ABSOLUTE

  if (exceedsRatioLimit && exceedsAbsoluteLimit) {
    return { ratio, commentLines: lineCount.comments }
  }
  return null
}

function checkSingleFunctionLength(func: FunctionInfo): FunctionViolation | null {
  const limits = func.isHandler ? FUNCTION_LIMITS.HANDLER : FUNCTION_LIMITS.STANDARD

  if (func.logicalLines >= limits.error) {
    return {
      name: func.name,
      line: func.line,
      logicalLines: func.logicalLines,
      severity: 'ERROR',
      limit: limits.error,
    }
  }

  if (func.logicalLines >= limits.warning) {
    return {
      name: func.name,
      line: func.line,
      logicalLines: func.logicalLines,
      severity: 'WARNING',
      limit: limits.warning,
    }
  }

  return null
}

function checkFunctionLengths(functions: FunctionInfo[]): FunctionViolation[] {
  if (!Array.isArray(functions)) {
    return []
  }

  const violations: FunctionViolation[] = []

  for (const func of functions) {
    const violation = checkSingleFunctionLength(func)
    if (violation) {
      violations.push(violation)
    }
  }

  return violations
}

/** @see ADR-033 File Length Limits */
export const fileLengthLimits = defineCheck({
  id: 'fdc71e86-6fea-4099-8949-d8c60d7013df',
  slug: 'file-length-limits',
  scope: { languages: ['typescript'], concerns: ['backend', 'frontend', 'cli'] },
  contentFilter: 'code-only',
  confidence: 'high',
  description:
    "Ensures files and functions don't exceed logical line limits (AST-based, Clean Code)",
  longDescription: `**Purpose:** Enforces ADR-033 file and function length limits using logical line counting (blank lines and comments excluded) to keep modules focused and functions small.

**Detects:** Analyzes each file individually using line-by-line counting and regex-based function extraction.
- Standard \`.ts\` files exceeding 500 (warning) or 700 (error) logical lines
- Component \`.tsx\` files exceeding 400 (warning) or 600 (error) logical lines
- Test files exceeding 800 (warning) or 1200 (error) logical lines
- Data-driven files (fitness checks, simulation recipes, route files) exceeding 1000/1500 logical lines
- Infrastructure package files exceeding 800/1000 logical lines
- Functions exceeding 60 (warning) or 80 (error) logical lines; handlers get 80/120
- Excessive comment ratios (>40% and >150 comment lines)

**Why it matters:** Long files and functions are harder to understand, test, and maintain. Logical line counting avoids penalizing well-documented code while still enforcing modularity.

**Scope:** Codebase-specific convention enforcing ADR-033`,
  tags: ['maintainability', 'readability', 'complexity', 'adr-033', 'quality'],
  fileTypes: ['ts', 'tsx'],
  docs: 'docs/adr/033-file-length-limits.md',

  analyze(content: string, filePath: string): CheckViolation[] {
    logger.debug({
      evt: 'fitness.check.file_length_limits.analyze',
      msg: 'Analyzing file for length limit violations',
      filePath,
    })
    const violations: CheckViolation[] = []

    const headerContent = content.slice(0, 1000)
    if (headerContent.includes('FILE-LENGTH EXEMPT')) {
      return []
    }

    const limits = getFileLimits(filePath)
    const lineCount = countLines(content)
    const isDataDriven = isDataDrivenFile(filePath)

    const lengthViolation = checkFileLength(lineCount.logical, limits)
    if (lengthViolation) {
      violations.push({
        line: 1,
        message: `File has ${lineCount.logical} logical lines (limit: ${lengthViolation.threshold}). Consider splitting into smaller modules.`,
        severity: lengthViolation.severity === 'ERROR' ? 'error' : 'warning',
        suggestion:
          'Split this file into smaller, focused modules. Extract related functionality into separate files with clear responsibilities.',
        type: `FILE_LENGTH_${lengthViolation.severity}`,
        match: `${lineCount.logical} lines`,
        filePath,
      })
    }

    const commentViolation = checkCommentRatio(lineCount)
    if (commentViolation) {
      violations.push({
        line: 1,
        message: `File has excessive comments: ${commentViolation.commentLines} comment lines (${Math.round(commentViolation.ratio * 100)}% of logical lines). May indicate over-documentation or generated code.`,
        severity: 'warning',
        suggestion:
          'Review comments for redundancy. Remove obvious comments, keep only those explaining "why" not "what".',
        type: 'EXCESSIVE_COMMENTS',
        match: `${commentViolation.commentLines} comments`,
        filePath,
      })
    }

    if (isDataDriven) {
      return violations
    }

    const functions = extractFunctions(content)
    const functionViolations = checkFunctionLengths(functions)

    for (const funcViolation of functionViolations) {
      violations.push({
        line: funcViolation.line,
        message: `Function '${funcViolation.name}' has ${funcViolation.logicalLines} logical lines (limit: ${funcViolation.limit}). Consider extracting helper functions.`,
        severity: funcViolation.severity === 'ERROR' ? 'error' : 'warning',
        suggestion: `Extract helper functions from '${funcViolation.name}' to reduce complexity. Each function should do one thing well.`,
        type: `FUNCTION_LENGTH_${funcViolation.severity}`,
        match: funcViolation.name,
        filePath,
      })
    }

    return violations
  },
})
