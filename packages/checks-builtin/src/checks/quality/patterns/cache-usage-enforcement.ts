// @fitness-ignore-file silent-early-returns -- Fitness check uses intentional guard clauses for file filtering; logging would pollute output
/**
 * @fileoverview Cache Usage Enforcement Check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/patterns/cache-usage-enforcement
 * @version 2.0.0
 *
 * Ensures fitness checks use sharedFileCache for TypeScript file reads
 * instead of direct fs.readFile calls. This prevents:
 * 1. Redundant disk I/O during parallel check execution
 * 2. Race conditions on file access
 * 3. Inconsistent performance
 *
 * Exceptions:
 * - External tool wrappers (ESLint, TypeScript, Prettier, etc.)
 * - Non-TypeScript file reads (JSON configs, markdown, etc.)
 * - Infrastructure files (cache implementation itself)
 */

import { defineCheck, type CheckViolation } from '@opensip-tools/core'

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Patterns that indicate external tool usage (legitimate exceptions)
 */
const EXTERNAL_TOOL_PATTERNS = [
  /eslint/i,
  /prettier/i,
  /typescript(?!\.ts)/i,
  /sonarjs/i,
  /dependency-security/i,
  /exec\s*\(/,
  /spawn\s*\(/,
  /abortableExec/,
]

/**
 * Files that are infrastructure (cache implementation itself)
 */
const INFRASTRUCTURE_FILE_PATTERNS = [
  /infrastructure\/cache\//,
  /infrastructure\/config\/loaders\//,
  /framework\//, // v2 framework files
]

/**
 * Patterns for reading non-TypeScript files (legitimate exceptions)
 */
const NON_TS_FILE_PATTERNS = [/\.json['"`]/, /\.md['"`]/, /\.yaml['"`]/, /\.yml['"`]/, /\.txt['"`]/]

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function isExternalToolWrapper(content: string): boolean {
  return EXTERNAL_TOOL_PATTERNS.some((pattern) => pattern.test(content))
}

function hasDirectReadPattern(line: string): boolean {
  // Skip imports/requires
  if (/^\s*(import|require|from)/.test(line)) {
    return false
  }

  // Skip ctx.readFile() - this IS the correct cached method for checks
  if (/ctx\.readFile\s*\(/.test(line)) {
    return false
  }

  // Look for direct fs.readFile or standalone readFile calls (not ctx.readFile)
  // fs.readFile, readFile(), await readFile() are violations
  // But ctx.readFile() is the correct way
  return /fs\.readFile\s*\(/.test(line) || /(?<!ctx\.)readFile\s*\(/.test(line)
}

function isReadingNonTsFile(line: string): boolean {
  return NON_TS_FILE_PATTERNS.some((pattern) => pattern.test(line))
}

function isLikelyTsFileRead(line: string, lines: string[], index: number): boolean {
  // Validate array parameter
  if (!Array.isArray(lines)) {
    return false
  }

  const contextStart = Math.max(0, index - 10)
  const contextEnd = Math.min(lines.length, index + 5)
  const context = lines.slice(contextStart, contextEnd).join('\n')

  // If context shows JSON/config reading, this is not a TS file read
  if (
    /\.json['"`]/.test(context) ||
    context.includes('JSON.parse') ||
    context.includes('configPath')
  ) {
    return false
  }

  // If context shows schema/config file patterns, this is not a TS file read
  if (/schemaFile|configFile|config\./.test(context)) {
    return false
  }

  // If we see .ts file patterns in context, it's likely a TypeScript read
  if (/\.ts['"`]/.test(context) || context.includes('**/*.ts')) {
    return true
  }

  // If the read uses a variable that specifically indicates TS files
  if (/tsFile|sourceFile|typescriptFile/.test(line)) {
    return true
  }

  // Generic "filePath" with .ts in context is likely TS
  if (line.includes('filePath') && context.includes('.ts')) {
    return true
  }

  return false
}

function isInfrastructureFile(filePath: string): boolean {
  return INFRASTRUCTURE_FILE_PATTERNS.some((p) => p.test(filePath))
}

// =============================================================================
// ANALYSIS FUNCTIONS
// =============================================================================

interface LineAnalysisResult {
  isViolation: boolean
  snippet?: string
  match?: string
}

/**
 * Analyze a single line for cache usage violations
 */
function analyzeLine(line: string, lineIndex: number, lines: string[]): LineAnalysisResult {
  // Check for direct read pattern
  if (!hasDirectReadPattern(line)) {
    return { isViolation: false }
  }

  // Check if it's reading a non-TypeScript file (legitimate exception)
  if (isReadingNonTsFile(line)) {
    return { isViolation: false }
  }

  // Check context: is this a TypeScript file read?
  if (!isLikelyTsFileRead(line, lines, lineIndex)) {
    return { isViolation: false }
  }

  // Build snippet
  const contextStart = Math.max(0, lineIndex - 2)
  const contextEnd = Math.min(lines.length, lineIndex + 3)
  const snippet = lines
    .slice(contextStart, contextEnd)
    .map((l, idx) => `${contextStart + idx + 1} | ${l}`)
    .join('\n')

  return {
    isViolation: true,
    snippet,
    match: line.trim().slice(0, 80),
  }
}

/** Options for createCacheViolation */
interface CreateCacheViolationOptions {
  lineNumber: number
  result: LineAnalysisResult
}

/**
 * Create a violation from analysis result
 */
function createCacheViolation(options: CreateCacheViolationOptions): CheckViolation {
  const { lineNumber, result } = options
  return {
    line: lineNumber,
    column: 0,
    message:
      'Direct fs.readFile used instead of sharedFileCache. Use sharedFileCache.getFileContent() for TypeScript files to benefit from caching.',
    severity: 'error',
    suggestion:
      'Replace fs.readFile() or direct readFile() with ctx.readFile() (in checks) or fileCache.get() for TypeScript file reads to enable caching across parallel checks',
    match: result.match ?? '',
  }
}

/**
 * Analyze a file for cache usage violations
 */
function analyzeFileForViolations(content: string, _filePath: string): CheckViolation[] {
  const violations: CheckViolation[] = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line === undefined) continue

    const result = analyzeLine(line, i, lines)
    if (result.isViolation) {
      violations.push(createCacheViolation({ lineNumber: i + 1, result }))
    }
  }

  return violations
}

// =============================================================================
// CHECK DEFINITION
// =============================================================================

/**
 * Check: quality/cache-usage-enforcement
 *
 * Detects fitness checks that read TypeScript files directly instead of
 * using sharedFileCache. Direct reads bypass the caching layer, causing
 * redundant disk I/O during parallel check execution.
 */
export const cacheUsageEnforcement = defineCheck({
  id: 'e53fe828-0855-4cbc-87e0-0b69e436d888',
  slug: 'cache-usage-enforcement',
  scope: { languages: ['typescript'], concerns: ['backend', 'server'] },
  contentFilter: 'code-only',

  confidence: 'medium',
  description: 'Ensure fitness checks use sharedFileCache for TypeScript file reads',
  longDescription: `**Purpose:** Ensures fitness check source files use the shared file cache (\`ctx.readFile()\`) instead of direct \`fs.readFile\` calls for TypeScript file reads.

**Detects:** Analyzes each file individually. Flags lines matching \`fs.readFile(\` or standalone \`readFile(\` (excluding \`ctx.readFile(\`) that appear to read TypeScript files based on surrounding context (\`.ts\`, \`tsFile\`, \`sourceFile\` references).

**Why it matters:** Direct file reads bypass the caching layer, causing redundant disk I/O and potential race conditions during parallel fitness check execution.

**Scope:** Codebase-specific convention for fitness check infrastructure`,
  tags: ['quality', 'internal', 'performance', 'best-practices'],
  fileTypes: ['ts', 'tsx'],
  timeout: 180_000, // 3 minutes - scans fitness check files

  analyze(content, filePath) {
    // Only analyze fitness check source files
    if (!filePath.includes('cli/internal/devtools/fitness/src/checks')) {
      return []
    }

    // Skip index files
    if (filePath.endsWith('/index.ts')) {
      return []
    }

    // Skip infrastructure files
    if (isInfrastructureFile(filePath)) {
      return []
    }

    // Check if file uses external tools (legitimate exception)
    if (isExternalToolWrapper(content)) {
      return []
    }

    return analyzeFileForViolations(content, filePath)
  },
})
