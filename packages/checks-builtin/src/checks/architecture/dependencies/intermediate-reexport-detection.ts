// @fitness-ignore-file no-raw-regex-on-code -- fitness check: regex patterns analyze trusted codebase content, not user input
/**
 * @fileoverview Intermediate Re-export Detection check (v2)
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/architecture/dependencies/intermediate-reexport-detection
 * @version 3.0.0
 */

import * as ts from 'typescript'

import { defineCheck, type CheckViolation } from '@opensip-tools/core'
import { getSharedSourceFile } from '@opensip-tools/core/framework/parse-cache.js'
import { hasExportModifier } from '../../../utils/index.js'

interface ReexportViolation {
  severity: 'error' | 'warning'
  message: string
  reexportCount: number
  ownExportCount: number
  externalReexports: string[]
}

interface ExportAnalysis {
  reexportCount: number
  ownExportCount: number
  externalReexports: string[]
}

/**
 * Check if a node is an exported declaration (function, class, variable, interface, type, enum)
 * @param node - The TypeScript node to check
 * @returns True if the node is an exported declaration
 */
function isExportedDeclaration(node: ts.Node): boolean {
  if (ts.isFunctionDeclaration(node)) return hasExportModifier(node)
  if (ts.isClassDeclaration(node)) return hasExportModifier(node)
  if (ts.isVariableStatement(node)) return hasExportModifier(node)
  if (ts.isInterfaceDeclaration(node)) return hasExportModifier(node)
  if (ts.isTypeAliasDeclaration(node)) return hasExportModifier(node)
  if (ts.isEnumDeclaration(node)) return hasExportModifier(node)
  return false
}

/**
 * Process an export declaration node
 * @param node - The export declaration node
 * @param analysis - The analysis object to update
 */
function processExportDeclaration(node: ts.ExportDeclaration, analysis: ExportAnalysis): void {
  if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
    const modulePath = node.moduleSpecifier.text
    analysis.reexportCount++
    if (!modulePath.startsWith('.') && !analysis.externalReexports.includes(modulePath)) {
      analysis.externalReexports.push(modulePath)
    }
  } else if (!node.moduleSpecifier) {
    analysis.ownExportCount++
  } else {
    // Other export declaration types - no action needed
  }
}

/**
 * Analyze exports in a TypeScript source file
 * @param content - The file content
 * @param filePath - The file path
 * @returns Export analysis results
 */
function analyzeExports(content: string, filePath: string): ExportAnalysis {
  const sourceFile = getSharedSourceFile(filePath, content)
    if (!sourceFile) return { reexportCount: 0, ownExportCount: 0, externalReexports: [] }
  const analysis: ExportAnalysis = {
    reexportCount: 0,
    ownExportCount: 0,
    externalReexports: [],
  }

  ts.forEachChild(sourceFile, function visit(node) {
    if (ts.isExportDeclaration(node)) {
      processExportDeclaration(node, analysis)
    } else if (isExportedDeclaration(node)) {
      analysis.ownExportCount++
    } else {
      // Non-export nodes - traverse children only
    }
    ts.forEachChild(node, visit)
  })

  return analysis
}

/**
 * Packages where barrel re-exports are expected due to deep module organization.
 */
const BARREL_EXEMPT_PACKAGES = ['packages/infrastructure/', 'packages/api-schemas/']

/** Package root entry points (packages, services, apps) where index.ts organizes the public API surface. */
const PACKAGE_ROOT_PATTERN = /^.*\/(packages|services|apps)\/[^/]+\/src\/index\.ts$/

/**
 * Determine if a file should be skipped based on its path.
 * Skips:
 * - Package root barrel files (e.g., packages/core/src/index.ts)
 * - Files in barrel-exempt packages (infrastructure, api-schemas)
 * - index.ts files that serve as module barrels (aggregating related exports)
 * @param filePath - The file path
 * @returns True if the file should be skipped
 */
function shouldSkipByPath(filePath: string): boolean {
  // Skip barrel-exempt packages entirely
  for (const exemptPath of BARREL_EXEMPT_PACKAGES) {
    if (filePath.includes(exemptPath)) {
      return true
    }
  }

  // Skip package root entry points
  if (PACKAGE_ROOT_PATTERN.test(filePath)) {
    return true
  }

  // Skip index.ts barrel files — these aggregate submodule exports
  if (filePath.endsWith('/index.ts')) {
    return true
  }

  return false
}

/**
 * Determine if a file should be skipped based on its content
 * @param content - The file content
 * @returns True if the file should be skipped
 */
function shouldSkipFile(content: string): boolean {
  return !content.includes('from ') || !content.includes('export')
}

/**
 * Create a violation from export analysis
 * @param analysis - The export analysis
 * @param isPureReexport - Whether this is a pure re-export file
 * @returns The violation object or null
 */
function createViolation(
  analysis: ExportAnalysis,
  isPureReexport: boolean,
): ReexportViolation | null {
  if (analysis.externalReexports.length === 0) {
    return null
  }

  const externalModules = analysis.externalReexports.join(', ')

  if (isPureReexport) {
    return {
      severity: 'error',
      message: `Pure re-export file - exports only from external modules: ${externalModules}`,
      ...analysis,
    }
  }

  return {
    severity: 'warning',
    message: `External re-exports detected. Import directly from canonical sources: ${externalModules}`,
    ...analysis,
  }
}

/**
 * Analyze a file and return a violation if applicable
 * @param content - The file content
 * @param filePath - The file path
 * @returns A violation or null
 */
function analyzeFileForViolation(content: string, filePath: string): ReexportViolation | null {
  const analysis = analyzeExports(content, filePath)
  const totalExports = analysis.reexportCount + analysis.ownExportCount

  if (totalExports === 0) {
    return null
  }

  const reexportRatio = analysis.reexportCount / totalExports
  const isPureReexport = reexportRatio === 1

  return createViolation(analysis, isPureReexport)
}

/**
 * Check: architecture/intermediate-reexport-detection
 *
 * Detects files that serve primarily as re-export intermediaries from external modules.
 * These create unnecessary indirection, obscure canonical sources, and make
 * dependency tracking harder.
 *
 * Excludes: index.ts barrel files, package root entry points, infrastructure/api-schemas packages
 */
export const intermediateReexportDetection = defineCheck({
  id: 'a589a5e7-78d2-4f52-9aa5-0beb8b4d3b37',
  slug: 'intermediate-reexport-detection',
  scope: { languages: ['typescript'], concerns: ['backend', 'frontend', 'cli'] },

  confidence: 'high',
  description: 'Detects files that serve as re-export intermediaries from external modules',
  longDescription: `**Purpose:** Detects non-barrel files that primarily re-export symbols from external modules, creating unnecessary indirection layers.

**Detects:**
- Pure re-export files (100% of exports are re-exports from non-relative module specifiers) -- flagged as errors
- Files with external re-exports mixed with own exports -- flagged as warnings
- Uses TypeScript AST to count \`export ... from '...'\` declarations vs own exported declarations

**Why it matters:** Intermediate re-exports obscure canonical import sources, complicate dependency tracking, and add indirection that confuses consumers.

**Excludes:** \`index.ts\` barrel files, package root entry points (\`packages/*/src/index.ts\`), and barrel-heavy packages (\`infrastructure\`, \`api-schemas\`).`,
  tags: ['architecture', 'maintainability'],
  fileTypes: ['ts'],

  analyze(content: string, filePath: string): CheckViolation[] {
    if (shouldSkipByPath(filePath)) {
      return []
    }

    if (shouldSkipFile(content)) {
      return []
    }

    const violation = analyzeFileForViolation(content, filePath)
    if (!violation) {
      return []
    }

    const isError = violation.severity === 'error'
    const externalModules = violation.externalReexports.join(', ')
    const suggestion = isError
      ? `Delete this file and import directly from the canonical sources: ${externalModules}`
      : `Remove re-exports and have consumers import directly from: ${externalModules}`
    const violationType = isError ? 'pure-reexport' : 'external-reexport'

    return [
      {
        line: 1,
        message: violation.message,
        severity: violation.severity,
        suggestion,
        match: externalModules,
        type: violationType,
      },
    ]
  },
})
