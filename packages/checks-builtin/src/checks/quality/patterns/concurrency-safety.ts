// @fitness-ignore-file file-length-limits -- Fitness check with comprehensive concurrency pattern detection rules
/**
 * @fileoverview Concurrency Safety check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/patterns/concurrency-safety
 * @version 2.0.0
 *
 * Detects potential concurrency issues in async code:
 * - Race conditions from shared mutable state
 * - Missing await on async operations
 * - Unsynchronized access to shared resources
 */

import * as ts from 'typescript'

import { defineCheck, type CheckViolation } from '@opensip-tools/core'
import { getSharedSourceFile } from '@opensip-tools/core/framework/parse-cache.js'
import { isTestFile } from '../../../utils/index.js'

/**
 * Union type for async function nodes
 */
type AsyncFunctionNode = ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction

/**
 * Analyze a file for concurrency issues
 * Note: Ignore directives are handled at the framework level in defineCheck()
 * @returns {CheckViolation[]} Array of violations found
 */
function analyzeFile(absolutePath: string, content: string): CheckViolation[] {
  const violations: CheckViolation[] = []

  const sourceFile = getSharedSourceFile(absolutePath, content)
    if (!sourceFile) return []

  const visit = (node: ts.Node) => {
    const options = {
      node,
      sourceFile,
      violations,
    }
    checkAsyncWithoutAwait(options)
    checkPromiseAllMutation(options)
    checkDetachedPromise(options)
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return violations
}

interface CheckConcurrencyIssueOptions {
  node: ts.Node
  sourceFile: ts.SourceFile
  violations: CheckViolation[]
}

function checkAsyncWithoutAwait(options: CheckConcurrencyIssueOptions): void {
  const { node, sourceFile, violations } = options
  // Validate array parameter
  if (!Array.isArray(violations)) {
    return
  }

  if (
    !(ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node)) ||
    !node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
  ) {
    return
  }

  // Skip Fastify plugin functions (they need async signature for the framework)
  if (isFastifyPluginFunction(node, sourceFile)) {
    return
  }

  // Skip route handler functions (async is required by framework contract)
  if (isRouteHandlerFunction(node, sourceFile)) {
    return
  }

  // Skip methods that implement interface contracts (async keyword mandated by interface/abstract class)
  if (isInterfaceImplementation(node)) {
    return
  }

  // Skip functions with JSDoc annotations indicating interface/override contracts
  if (hasInterfaceContractComment(node, sourceFile)) {
    return
  }

  // Skip small async functions (5 or fewer lines) — likely thin wrappers
  if (isSmallFunction(node, sourceFile)) {
    return
  }

  // Skip functions in files with known sync-API imports (Drizzle ORM, better-sqlite3)
  if (hasKnownSyncImports(sourceFile)) {
    return
  }

  if (!hasAwaitExpression(node)) {
    // @lazy-ok -- 'await' appears in function name, not an actual await expression
    const { line: lineIdx, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
    const line = lineIdx + 1
    const name = getFunctionName(node)
    violations.push({
      line,
      column: character + 1,
      message: `Async function '${name}' has no await expressions`,
      severity: 'warning',
      suggestion: `Either remove 'async' keyword from '${name}' if not needed, or add 'await' before async operations inside the function`,
      type: 'async-without-await',
      match: `async ${name}`,
    })
  }
}

function checkPromiseAllMutation(options: CheckConcurrencyIssueOptions): void {
  const { node, sourceFile, violations } = options
  // Validate array parameter
  if (!Array.isArray(violations)) {
    return
  }

  if (!ts.isCallExpression(node)) return

  const callText = node.expression.getText(sourceFile)
  if (!(callText === 'Promise.all' || callText.endsWith('.all'))) return

  for (const arg of node.arguments) {
    if (hasSharedStateMutation(arg, sourceFile)) {
      const { line: lineIdx, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
      const line = lineIdx + 1
      violations.push({
        line,
        column: character + 1,
        message: 'Promise.all may have race condition from shared state mutation',
        severity: 'warning',
        suggestion:
          'Refactor parallel operations to collect results without mutating shared state, then merge results after Promise.all completes',
        type: 'race-condition',
        match: callText,
      })
      break
    }
  }
}

function checkDetachedPromise(options: CheckConcurrencyIssueOptions): void {
  const { node, sourceFile, violations } = options
  // Validate array parameter
  if (!Array.isArray(violations)) {
    return
  }

  if (!ts.isExpressionStatement(node) || !ts.isCallExpression(node.expression)) return

  if (isAsyncCall(node.expression, sourceFile) && !isVoidPrefixed(node)) {
    const { line: lineIdx, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart())
    const line = lineIdx + 1
    const callText = node.expression.getText(sourceFile).slice(0, 50)
    violations.push({
      line,
      column: character + 1,
      message: 'Detached promise (fire-and-forget async call)',
      severity: 'warning',
      suggestion: `Add 'await' before the call, or use 'void ${callText}.catch(err => logger.warn(...))' for intentional fire-and-forget`,
      type: 'detached-promise',
      match: callText,
    })
  }
}

/**
 * Check if function has any await expressions, for-await loops, or returns a Promise directly
 * @param {ts.Node} node - The AST node to check
 * @returns {boolean} True if the function has await expressions or returns a Promise
 */
function hasAwaitExpression(node: ts.Node): boolean {
  // Use state object to track findings across callback invocations
  // (TypeScript can't track primitive mutations in callbacks)
  const state = { hasAwait: false, returnsPromise: false, returnsSyncValue: false }

  const visit = (n: ts.Node) => {
    if (state.hasAwait || state.returnsPromise || state.returnsSyncValue) return
    if (ts.isAwaitExpression(n) || ts.isForOfStatement(n)) {
      state.hasAwait = true
      return
    }
    // Check if function returns a Promise-returning call directly
    if (ts.isReturnStatement(n) && n.expression && returnsPromiseDirectly(n.expression)) {
      state.returnsPromise = true
      return
    }
    // Check if function returns a synchronous value directly (intentional Promise wrapping)
    // e.g., `return db.select(...)` or `return someValue` without await
    if (ts.isReturnStatement(n) && n.expression && !ts.isAwaitExpression(n.expression)
      && !(ts.isIdentifier(n.expression) && n.expression.text === 'undefined')) {
      state.returnsSyncValue = true
      return
    }
    // Don't recurse into nested functions
    if (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isArrowFunction(n)) {
      return
    }
    ts.forEachChild(n, visit)
  }

  // For arrow functions with expression body (no explicit return)
  if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) {
    // Expression-body arrow functions always return a value — treat as intentional
    return true
  }

  ts.forEachChild(node, visit)
  return state.hasAwait || state.returnsPromise || state.returnsSyncValue
}

/**
 * Check if an expression is a known Promise-returning pattern
 * @param {ts.Expression} expr - The expression to check
 * @returns {boolean} True if the expression returns a Promise
 */
function returnsPromiseDirectly(expr: ts.Expression): boolean {
  // Patterns that return Promises and don't need internal await:
  // - withErrorNormalization(...), withTimeout(...), withRetry(...)
  // - Promise.all(...), Promise.race(...), Promise.allSettled(...)
  // - this.initGuard.initialize(...), this.someMethod(...) where method is async
  // - Fastify plugin patterns: fastify.register(...), fastify.get(...)

  if (ts.isCallExpression(expr)) {
    const callText = expr.expression.getText()

    // Common Promise-returning wrapper functions
    const promiseWrappers = [
      'withErrorNormalization',
      'withTimeout',
      'withRetry',
      'withCircuitBreaker',
      'withTracing',
      'Promise.all',
      'Promise.race',
      'Promise.allSettled',
      'Promise.resolve',
      'Promise.reject',
    ]

    if (promiseWrappers.some((wrapper) => callText.includes(wrapper))) {
      return true
    }

    // Method calls that likely return Promises (common async patterns)
    const asyncMethodPatterns = [
      /\.initialize\(/,
      /\.run\(/,
      /\.execute\(/,
      /\.start\(/,
      /\.load\(/,
      /\.fetch\(/,
      /\.save\(/,
      /\.create\(/,
      /\.update\(/,
      /\.delete\(/,
      /initGuard\./,
    ]

    if (asyncMethodPatterns.some((pattern) => pattern.test(callText))) {
      return true
    }
  }

  // Chain expression like: this.cache.get(...).then(...)
  if (ts.isCallExpression(expr) && ts.isPropertyAccessExpression(expr.expression)) {
    const methodName = expr.expression.name.getText()
    if (['then', 'catch', 'finally'].includes(methodName)) {
      return true
    }
  }

  return false
}

function hasSharedStateMutation(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  if (isParameterizedMapCall(node, sourceFile)) {
    return false // Safe: parameterized operation
  }

  let hasMutation = false
  const visit = (n: ts.Node) => {
    if (isPropertyAssignment(n, sourceFile) || isUnsafeMutationMethod(n, sourceFile)) {
      hasMutation = true
    }
    if (!hasMutation) {
      ts.forEachChild(n, visit)
    }
  }
  visit(node)
  return hasMutation
}

function isParameterizedMapCall(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false

  const methodName = node.expression.name.getText(sourceFile)
  if (methodName !== 'map' || node.arguments.length === 0) return false

  const mapCallback = node.arguments[0]
  if (!mapCallback || !ts.isArrowFunction(mapCallback) || mapCallback.parameters.length === 0)
    return false

  // parameters[0] is guaranteed to exist since we checked length === 0 above
  const firstParam = mapCallback.parameters[0]
  if (!firstParam) return false

  const paramName = firstParam.name.getText(sourceFile)
  if (!ts.isCallExpression(mapCallback.body)) return false

  const callText = mapCallback.body.getText(sourceFile)
  return !!(paramName && callText.includes(paramName))
}

function isPropertyAssignment(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken)
    return false

  const leftText = node.left.getText(sourceFile)
  return leftText.startsWith('this.') || leftText.includes('[')
}

function isUnsafeMutationMethod(node: ts.Node, sourceFile: ts.SourceFile): boolean {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false

  const method = node.expression.name.getText(sourceFile)
  return ['push', 'pop', 'shift', 'unshift', 'splice', 'set'].includes(method)
}

/**
 * Check if function name indicates it's a Fastify plugin
 * @param {string} funcName - The function name to check
 * @returns {boolean} True if the function name indicates a plugin
 */
function isFastifyPluginByName(funcName: string): boolean {
  return funcName.endsWith('Routes') || funcName.endsWith('Plugin') || funcName.endsWith('plugin')
}

/**
 * Check if parameter indicates a Fastify plugin
 * @param {ts.ParameterDeclaration} param - The parameter to check
 * @param {ts.SourceFile} sourceFile - The source file
 * @returns {boolean} True if parameter indicates a Fastify plugin
 */
function isFastifyPluginByParameter(
  param: ts.ParameterDeclaration,
  sourceFile: ts.SourceFile,
): boolean {
  const paramName = param.name.getText(sourceFile)
  if (paramName === 'fastify' || paramName === 'app') {
    return true
  }

  // Check type annotation for FastifyInstance
  if (!param.type) {
    return false
  }

  const typeText = param.type.getText(sourceFile)
  return typeText.includes('FastifyInstance') || typeText.includes('FastifyPluginAsync')
}

/**
 * Check if function is a Fastify plugin (async signature required by framework)
 * @returns {boolean} True if the function is a Fastify plugin
 */
function isFastifyPluginFunction(node: AsyncFunctionNode, sourceFile: ts.SourceFile): boolean {
  // Check function name patterns
  const funcName = getFunctionName(node)
  if (isFastifyPluginByName(funcName)) {
    return true
  }

  // Check if first parameter indicates Fastify plugin
  if (node.parameters.length === 0) {
    return false
  }

  const firstParam = node.parameters[0]
  return firstParam ? isFastifyPluginByParameter(firstParam, sourceFile) : false
}

/**
 * Check if function is a route handler (async signature required by framework)
 * @returns {boolean} True if the function is a route handler
 */
function isRouteHandlerFunction(node: AsyncFunctionNode, sourceFile: ts.SourceFile): boolean {
  // Check if parameters include request/reply or req/res patterns
  const paramNames = node.parameters.map((p) => p.name.getText(sourceFile))
  const routeHandlerParams = ['request', 'reply', 'req', 'res', 'event', 'context']

  return paramNames.some((name) => routeHandlerParams.includes(name.toLowerCase()))
}

/**
 * Check if method implements an interface contract (async keyword mandated by the interface/abstract class).
 * Methods with `override` keyword or within a class that `implements` an interface should not be
 * flagged for async-without-await, since removing async would break the contract.
 */
function isInterfaceImplementation(node: AsyncFunctionNode): boolean {
  // Only applies to method declarations within a class
  if (!ts.isMethodDeclaration(node)) {
    return false
  }

  // Check for override keyword (explicitly implementing base class method)
  if (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.OverrideKeyword)) {
    return true
  }

  // Check if parent class has an implements clause
  const parent = node.parent
  // eslint-disable-next-line sonarjs/no-collapsible-if -- Intentional: outer check narrows parent type for TypeScript, inner check inspects heritage clauses
  if (ts.isClassDeclaration(parent) || ts.isClassExpression(parent)) {
    if (
      // @fitness-ignore-next-line unsafe-secret-comparison -- Comparing TypeScript AST syntax kind token, not a cryptographic token
      parent.heritageClauses?.some((clause) => clause.token === ts.SyntaxKind.ImplementsKeyword)
    ) {
      return true
    }
  }

  return false
}

/**
 * Known synchronous functions that contain async-like keywords
 */
const SYNCHRONOUS_FUNCTIONS = [
  'sendExpressRateLimitResponse', // Express rate limit response is synchronous
  'sendResponse', // Generic response sending might be sync
  'sendError', // Error responses are often sync
  'notifyAuthenticationStarted', // Internal notification - synchronous
  'notifyAuthenticationCompleted', // Internal notification - synchronous
  'emitMetrics', // Metrics emission - synchronous wrapper
  'notify', // Most notify methods are sync with internal error handling
  '.emit', // EventEmitter emit is synchronous
]

/**
 * Check if a call text indicates a known synchronous function
 * @param {string} callText - The call expression text
 * @returns {boolean} True if it's a known synchronous function
 */
function isKnownSyncFunction(callText: string): boolean {
  return SYNCHRONOUS_FUNCTIONS.some((fn) => callText.includes(fn))
}

/**
 * Check if a call text indicates a known async pattern (fetch, axios, http calls)
 * @param {string} callText - The call expression text
 * @returns {boolean} True if it's a known async pattern
 */
function isKnownAsyncPattern(callText: string): boolean {
  // Actual fetch calls
  // @fitness-ignore-next-line no-raw-fetch -- string pattern matching in fitness check logic, not an actual fetch() call
  if (callText.includes('fetch(')) {
    return true
  }

  // Axios calls
  if (callText.includes('axios.')) {
    return true
  }

  // HTTP get/post calls
  const isHttpCall = callText.includes('http')
  const isGetOrPost = callText.includes('.get(') || callText.includes('.post(')
  return isHttpCall && isGetOrPost
}

/**
 * Check if call expression is async
 *
 * This uses a heuristic to detect async calls. We look for common async patterns
 * but exclude known synchronous functions.
 * @returns {boolean} True if the call is async
 */
function isAsyncCall(node: ts.CallExpression, sourceFile: ts.SourceFile): boolean {
  const callText = node.expression.getText(sourceFile)

  if (isKnownSyncFunction(callText)) {
    return false
  }

  return isKnownAsyncPattern(callText)
}

/**
 * Check if expression statement is void prefixed
 * @param {ts.ExpressionStatement} node - The expression statement to check
 * @returns {boolean} True if the expression is void prefixed
 */
function isVoidPrefixed(node: ts.ExpressionStatement): boolean {
  return ts.isVoidExpression(node.expression)
}

/**
 * Check if function has a JSDoc comment indicating interface/override contract.
 * Looks for @implements, @override, or @interface tags in leading comments.
 */
function hasInterfaceContractComment(node: AsyncFunctionNode, sourceFile: ts.SourceFile): boolean {
  const fullText = sourceFile.getFullText()
  const nodeStart = node.getFullStart()
  // Look at up to 500 chars before the node for JSDoc comments
  const lookbackStart = Math.max(0, nodeStart - 500)
  const precedingText = fullText.slice(lookbackStart, nodeStart)

  // Check for JSDoc tags that indicate interface contracts
  return /@implements\b/.test(precedingText) ||
    /@override\b/.test(precedingText) ||
    /@interface\b/.test(precedingText)
}

/**
 * Check if an async function body has 5 or fewer logical lines (small wrapper).
 */
function isSmallFunction(node: AsyncFunctionNode, sourceFile: ts.SourceFile): boolean {
  const body = node.body
  if (!body) return true // no body = declaration, skip

  if (!ts.isBlock(body)) {
    // Arrow function with expression body — always small
    return true
  }

  const startLine = sourceFile.getLineAndCharacterOfPosition(body.getStart()).line
  const endLine = sourceFile.getLineAndCharacterOfPosition(body.getEnd()).line
  const lineCount = endLine - startLine + 1

  return lineCount <= 5
}

/**
 * Check if the source file has imports from known synchronous APIs
 * (Drizzle ORM with better-sqlite3, CLIWriter).
 */
function hasKnownSyncImports(sourceFile: ts.SourceFile): boolean {
  const fullText = sourceFile.getFullText()

  const syncImportPatterns = [
    "from 'drizzle-orm",
    'from "drizzle-orm',
    "from 'better-sqlite3",
    'from "better-sqlite3',
  ]

  return syncImportPatterns.some((pattern) => fullText.includes(pattern))
}

/**
 * Path patterns where async-without-await is expected (framework/interface contracts).
 */
const EXCLUDED_PATH_PATTERNS = [
  /services\/apiserver\/src\/stores\//,
  /services\/apiserver\/src\/routes\//,
  /apps\/cli\/src\/commands\//,
]

/**
 * Check if a file path is in a location where async-without-await is expected.
 */
function isExcludedPath(filePath: string): boolean {
  return EXCLUDED_PATH_PATTERNS.some((pattern) => pattern.test(filePath))
}

/**
 * Get function name from node
 * @returns {string} The function name or '<anonymous>' if not found
 */
// @fitness-ignore-next-line duplicate-utility-functions -- Each fitness check defines its own getFunctionName typed to its specific node type (AsyncFunctionNode here); extracting would couple independent checks
function getFunctionName(node: AsyncFunctionNode): string {
  if (ts.isFunctionDeclaration(node) && node.name) {
    return node.name.text
  }
  if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
    return node.name.text
  }
  if (
    ts.isArrowFunction(node) &&
    ts.isVariableDeclaration(node.parent) &&
    ts.isIdentifier(node.parent.name)
  ) {
    return node.parent.name.text
  }
  return '<anonymous>'
}

/**
 * Check: quality/concurrency-safety
 *
 * Detects potential race conditions and concurrency issues in async code.
 */
export const concurrencySafety = defineCheck({
  id: 'efd55efb-a92e-465a-9927-b1bf3edb3228',
  slug: 'concurrency-safety',
  scope: { languages: ['typescript'], concerns: ['backend', 'server'] },
  contentFilter: 'code-only',

  confidence: 'high',
  description: 'Detect potential race conditions and concurrency issues',
  longDescription: `**Purpose:** Detects potential race conditions and concurrency issues in async code using TypeScript AST analysis.

**Detects:** Analyzes each file individually. Checks for three patterns:
- Async functions without any \`await\` expressions (unnecessary \`async\` keyword), excluding Fastify plugins and route handlers
- \`Promise.all\` calls where callbacks mutate shared state via property assignment or array mutation methods (\`push\`, \`splice\`, \`set\`, etc.)
- Detached promises (fire-and-forget async calls like \`fetch(\` or \`axios.\` without \`await\` or \`void\` prefix)

**Why it matters:** Unhandled concurrency bugs cause intermittent failures that are extremely difficult to reproduce and diagnose in production.

**Scope:** General best practice`,
  tags: ['quality', 'async', 'concurrency', 'race-conditions'],
  fileTypes: ['ts'],

  analyze(content, filePath) {
    // Skip test files — concurrency issues in tests are low-risk
    if (isTestFile(filePath)) return []

    // Skip paths where async-without-await is expected (stores, routes, CLI commands)
    if (isExcludedPath(filePath)) return []

    // Quick filter: skip files without async patterns
    if (!content.includes('async') && !content.includes('Promise')) {
      return []
    }

    return analyzeFile(filePath, content)
  },
})
