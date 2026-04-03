// @fitness-ignore-file file-length-limits -- reviewed: tightly coupled AST analysis logic requires single-file cohesion for maintainability
/**
 * @fileoverview Correlation ID Coverage check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/observability/correlation-id-coverage
 * @version 2.0.0
 *
 * Validates that all API endpoints and service methods include correlation IDs
 * for distributed tracing and observability.
 */

import { basename } from 'node:path'

import * as ts from 'typescript'

import { defineCheck, type CheckViolation } from '@opensip-tools/core'
import { getSharedSourceFile } from '@opensip-tools/core/framework/parse-cache.js'

/**
 * Check if file has a fitness-ignore-file directive for this check
 *
 * @param {string} content - File content to check
 * @param {string} checkId - Check ID to look for in directives
 * @returns {boolean} True if the file has an ignore directive for this check, false otherwise
 */
function hasIgnoreDirective(content: string, checkId: string): boolean {
  // Check first 50 lines for file-level ignore directive
  const lines = content.split('\n').slice(0, 50)
  const pattern = /^\s*\/\/\s*@fitness-ignore-file\s+(\S+)/

  for (const line of lines) {
    const match = pattern.exec(line)
    if (match) {
      const directiveCheckId = match[1]
      if (directiveCheckId === checkId) {
        return true
      }
    }
  }
  return false
}

/**
 * Check if file is an API/service file (but not a barrel export)
 */
function isTargetFile(filePath: string): boolean {
  // Exclude barrel export files (index.ts in contract/type definition directories)
  if (filePath.endsWith('/index.ts') && filePath.includes('/contracts/')) {
    return false
  }

  // Exclude fitness check files that happen to live under /api/ or /services/ paths
  // (these are check definitions, not actual API handlers or services)
  if (filePath.includes('/checks/')) {
    return false
  }

  // Exclude frontend/dashboard client-side API utilities (not server handlers)
  if (filePath.includes('/dashboard/') || filePath.includes('/apps/')) {
    return false
  }

  // Exclude database, catalog, and infrastructure files within services
  // (these don't handle HTTP requests directly)
  if (
    filePath.includes('/database/') ||
    filePath.includes('/catalog/') ||
    filePath.includes('/reconciler/')
  ) {
    return false
  }

  // Exclude the embedded local API server (apiserver) — it runs on localhost only
  // and does not participate in distributed tracing. Correlation IDs are not needed
  // for a single-process CLI tool's embedded API.
  if (filePath.includes('/apiserver/')) {
    return false
  }

  // Exclude adapters — these are local package-level abstractions,
  // not distributed microservice endpoints
  if (filePath.includes('/adapters/')) {
    return false
  }

  // Exclude package-level service classes (under packages/) — these are local
  // service implementations, not distributed microservice endpoints that need
  // correlation ID tracing
  if (filePath.includes('/packages/') && filePath.includes('-service.ts')) {
    return false
  }

  const isApiPath = filePath.includes('/api/') || filePath.includes('/routes/')
  const isServicePath = filePath.includes('/services/')
  const isHandlerFile = filePath.includes('-handler.ts') || filePath.includes('-service.ts')

  return isApiPath || isServicePath || isHandlerFile
}

/**
 * Analyze a file for correlation ID coverage
 *
 * @param {string} content - File content to analyze
 * @param {string} filePath - Path to the file being analyzed
 * @returns {CheckViolation[]} Array of violations found in the file
 */
function analyzeFile(content: string, filePath: string): CheckViolation[] {
  const violations: CheckViolation[] = []
  const checkId = 'correlation-id-coverage'

  // Only check API/service files
  if (!isTargetFile(filePath)) {
    return violations
  }

  // Check for file-level ignore directive
  if (hasIgnoreDirective(content, checkId)) {
    return violations
  }

  // Check for API handlers without correlation ID extraction
  const isApiPath = filePath.includes('/api/') || filePath.includes('/routes/')
  const isApiFile = isApiPath || filePath.includes('-handler.ts')

  if (isApiFile) {
    const hasExplicitExtraction =
      content.includes('getCorrelationId') ||
      content.includes('x-correlation-id') ||
      content.includes('X-Correlation-Id')
    const hasCorrelationIdReference =
      content.includes('correlationId') || content.includes('CorrelationId')
    const hasEnsureMethod =
      content.includes('ensureCorrelationIdFor') || content.includes('ensureCorrelationId')
    const hasCorrelationExtraction =
      hasExplicitExtraction || hasCorrelationIdReference || hasEnsureMethod

    if (!hasCorrelationExtraction) {
      violations.push({
        line: 1,
        column: 0,
        message: 'API handler does not extract correlation ID from request',
        severity: 'warning',
        suggestion:
          "Extract correlation ID: const correlationId = req.headers['x-correlation-id'] || generateCorrelationId()",
        type: 'missing-correlation-extraction',
        match: basename(filePath),
      })
    }
  }

  // Check service methods for correlation ID parameter
  // Skip service method check if file uses AsyncLocalStorage pattern (ensureCorrelationIdFor)
  const usesAsyncLocalStorage = content.includes('ensureCorrelationIdFor')

  const sourceFile = getSharedSourceFile(filePath, content)
    if (!sourceFile) return []

  const visit = (node: ts.Node): void => {
    // Check exported async functions/methods in services
    if (
      (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
    ) {
      const isExported = node.modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      const isPublicMethod =
        ts.isMethodDeclaration(node) &&
        !node.modifiers.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword)

      if (filePath.includes('-service.ts') && (isExported || isPublicMethod)) {
        // Skip if file uses AsyncLocalStorage pattern for correlation
        if (usesAsyncLocalStorage) {
          return
        }

        const hasCorrelationParam = node.parameters.some((p) => {
          const paramName = ts.isIdentifier(p.name) ? p.name.text : ''
          return (
            paramName.toLowerCase().includes('correlation') ||
            paramName === 'ctx' ||
            paramName === 'context'
          )
        })

        if (!hasCorrelationParam) {
          const name = getFunctionName(node)
          const { line: lineIdx, character } = sourceFile.getLineAndCharacterOfPosition(
            node.getStart(),
          )
          const line = lineIdx + 1

          violations.push({
            line,
            column: character + 1,
            message: `Service method '${name}' lacks correlation ID or context parameter`,
            severity: 'warning',
            suggestion: `Add 'ctx: RequestContext' or 'correlationId: string' parameter to '${name}' for distributed tracing`,
            type: 'missing-correlation-param',
            match: name,
          })
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return violations
}

/**
 * Get function name from node
 *
 * @param {ts.FunctionDeclaration | ts.MethodDeclaration} node - AST node to extract name from
 * @returns {string} Function name, or '<anonymous>' if unable to determine
 */
// @fitness-ignore-next-line duplicate-utility-functions -- Check-specific helper for FunctionDeclaration | MethodDeclaration; each fitness check defines its own variant for its node type
function getFunctionName(node: ts.FunctionDeclaration | ts.MethodDeclaration): string {
  if (ts.isFunctionDeclaration(node) && node.name) {
    return node.name.text
  }
  if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
    return node.name.text
  }
  return '<anonymous>'
}

/**
 * Check: quality/correlation-id-coverage
 *
 * Validates that API endpoints and service methods include correlation IDs.
 */
export const correlationIdCoverage = defineCheck({
  id: '3b725078-271e-4797-851b-7f05a1f809df',
  slug: 'correlation-id-coverage',
  scope: { languages: ['typescript'], concerns: ['backend', 'server'] },
  contentFilter: 'raw',

  confidence: 'high',
  description: 'Validate API endpoints and services include correlation IDs',
  longDescription: `**Purpose:** Validates that all API endpoints extract correlation IDs from requests and that service methods accept correlation context as a parameter.

**Detects:**
- API/route handler files (in \`/api/\`, \`/routes/\`, or \`*-handler.ts\`) missing correlation ID extraction (\`getCorrelationId\`, \`x-correlation-id\`, \`X-Correlation-Id\`, \`ensureCorrelationId\`)
- Exported or public async methods in \`*-service.ts\` files lacking a \`correlation\`, \`ctx\`, or \`context\` parameter (uses TypeScript AST to inspect function signatures)
- Skips files that use the \`ensureCorrelationIdFor\` AsyncLocalStorage pattern, as correlation is handled automatically

**Why it matters:** Correlation IDs enable end-to-end request tracing across distributed services; missing them creates observability blind spots.

**Scope:** General best practice. Analyzes each file individually using TypeScript AST parsing.`,
  tags: ['quality', 'observability', 'tracing', 'api', 'correlation-id'],
  fileTypes: ['ts'],

  analyze: analyzeFile,
})
