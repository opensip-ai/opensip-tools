// @fitness-ignore-file toctou-race-condition -- TOCTOU acceptable in this non-concurrent context
// @fitness-ignore-file fitness-check-standards -- Uses fs to read coverage report JSON, not source file scanning
// @fitness-ignore-file file-length-limits -- Complex module with tightly coupled logic; refactoring would risk breaking changes
/**
 * @fileoverview ADR-035: Code Coverage check with per-module reporting
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/observability/code-coverage
 * @version 3.0.0
 * @see ADR-035 - Code Coverage Requirements
 *
 * This check validates code coverage at the module level, reporting coverage
 * for each module independently. Uses layer-based thresholds per ADR-035:
 * - Foundational layer: 95% (all metrics)
 * - Shared layer: 90% (all metrics)
 * - Services/Apps layer: 85% (all metrics)
 *
 * IMPORTANT: This check reads existing coverage reports - it does NOT run tests.
 * Run `pnpm test:coverage` before running fitness checks to generate coverage data.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

import { defineCheck, type CheckViolation } from '@opensip-tools/core'

// =============================================================================
// CONSTANTS
// =============================================================================

// Layer-based thresholds (ADR-035)
const FOUNDATIONAL_THRESHOLD = 95
const SHARED_THRESHOLD = 90
const SERVICES_APPS_THRESHOLD = 85
const DEFAULT_THRESHOLD = 85
const WARNING_THRESHOLD_OFFSET = 9
const MAX_REPORT_AGE_MINUTES = 60
const COVERAGE_REPORT_PATH = 'coverage/coverage-summary.json'
const COVERAGE_SUMMARY_FILENAME = 'coverage-summary.json'
const TEST_COVERAGE_CMD = 'pnpm test:coverage'

// =============================================================================
// TYPES
// =============================================================================

type ModuleType =
  | 'foundation'
  | 'infrastructure'
  | 'domain'
  | 'service'
  | 'app'
  | 'vertical'
  | 'other'

interface CoverageMetric {
  total: number
  covered: number
  pct: number
}

interface CoverageSummary {
  statements: CoverageMetric
  branches: CoverageMetric
  functions: CoverageMetric
  lines: CoverageMetric
}

interface VitestCoverageSummary {
  lines: CoverageMetric
  statements: CoverageMetric
  functions: CoverageMetric
  branches: CoverageMetric
}

type CoverageStatus = 'passing' | 'warning' | 'error'

// =============================================================================
// ANALYSIS FUNCTIONS
// =============================================================================

/**
 * Get the coverage report path
 * @param {string} cwd - Current working directory path
 * @returns {string} Full path to the coverage report file
 */
function getCoverageReportPath(cwd: string): string {
  return path.join(cwd, COVERAGE_REPORT_PATH)
}

/**
 * Check if coverage report is stale
 * @param {string} cwd - Current working directory path
 * @returns {object} Object with isStale flag, ageMinutes, and optional reason
 * @returns {boolean} returns.isStale - True if report is missing or too old
 * @returns {number} returns.ageMinutes - Age of report in minutes
 * @returns {string} [returns.reason] - Human-readable reason if stale
 */
function checkReportAge(cwd: string): {
  isStale: boolean
  ageMinutes: number
  reason?: string
} {
  const reportPath = getCoverageReportPath(cwd)

  if (!fs.existsSync(reportPath)) {
    return {
      isStale: true,
      ageMinutes: -1,
      reason: 'Coverage report not found',
    }
  }

  const stats = fs.statSync(reportPath)
  const ageMs = Date.now() - stats.mtimeMs
  const ageMinutes = Math.round(ageMs / 60000)

  if (ageMinutes > MAX_REPORT_AGE_MINUTES) {
    return {
      isStale: true,
      ageMinutes,
      reason: `Coverage report is ${ageMinutes} minutes old (max: ${MAX_REPORT_AGE_MINUTES})`,
    }
  }

  return { isStale: false, ageMinutes }
}

/**
 * Parse Vitest coverage report (Istanbul format)
 * @param {string} cwd - Current working directory path
 * @returns {Record<string, CoverageSummary> | null} Coverage data by file path, or null if parse fails
 */
function parseVitestCoverage(cwd: string): Record<string, CoverageSummary> | null {
  try {
    const reportPath = getCoverageReportPath(cwd)

    if (!fs.existsSync(reportPath)) {
      return null
    }

    const content = fs.readFileSync(reportPath, 'utf-8')
    const data = JSON.parse(content) as Record<string, VitestCoverageSummary>

    const result: Record<string, CoverageSummary> = {}

    // Convert Vitest coverage format to internal format
    for (const [filePath, metrics] of Object.entries(data)) {
      // Skip the 'total' entry
      if (filePath === 'total') continue

      result[filePath] = {
        statements: metrics.statements,
        branches: metrics.branches,
        functions: metrics.functions,
        lines: metrics.lines,
      }
    }

    return result
  } catch {
    // @swallow-ok graceful degradation - return sentinel on failure
    return null
  }
}

/**
 * Detect module type from file path
 * @param {string} filePath - File path to analyze
 * @returns {ModuleType} The detected module type
 */
function getModuleType(filePath: string): ModuleType {
  if (filePath.includes('/foundation/')) {
    return 'foundation'
  }
  if (filePath.includes('/infrastructure/')) {
    return 'infrastructure'
  }
  if (filePath.includes('/domain/')) {
    return 'domain'
  }
  if (filePath.includes('/services/')) {
    return 'service'
  }
  if (filePath.includes('/apps/')) {
    return 'app'
  }
  if (filePath.includes('/verticals/')) {
    return 'vertical'
  }
  return 'other'
}

/**
 * Extract module name from file path
 * @param {string} filePath - The file path to extract the module name from
 * @returns {string} The extracted module name
 */
function getModuleName(filePath: string): string {
  // Extract meaningful module name from path
  // e.g., "packages/foundation/src/logger/index.ts" -> "foundation/logger"
  const parts = filePath.split('/')

  // Find the src directory and get what comes after
  const srcIndex = parts.indexOf('src')
  if (srcIndex !== -1 && srcIndex < parts.length - 1) {
    // Get parent of src (package name) and first directory after src
    const packageName = parts[srcIndex - 1]
    const moduleName = parts[srcIndex + 1]
    if (packageName && moduleName) {
      return `${packageName}/${moduleName}`
    }
  }

  // Fallback: use last two meaningful directories
  const filtered = parts.filter((p) => p && !p.endsWith('.ts') && !p.endsWith('.tsx'))
  return filtered.slice(-2).join('/')
}

/**
 * Get coverage threshold for a module type based on its layer (ADR-035)
 * @param {ModuleType} type - The module type to get threshold for
 * @returns {number} The coverage threshold percentage
 */
function getModuleThreshold(type: ModuleType): number {
  switch (type) {
    case 'foundation':
      return FOUNDATIONAL_THRESHOLD
    case 'infrastructure':
    case 'domain':
      return SHARED_THRESHOLD
    case 'service':
    case 'app':
    case 'vertical':
      return SERVICES_APPS_THRESHOLD
    default:
      return DEFAULT_THRESHOLD
  }
}

/**
 * Get minimum coverage percentage across all metrics
 * @param {CoverageSummary} coverage - The coverage summary to analyze
 * @returns {number} The minimum coverage percentage
 */
function getMinCoverage(coverage: CoverageSummary): number {
  return Math.min(
    coverage.lines.pct,
    coverage.statements.pct,
    coverage.functions.pct,
    coverage.branches.pct,
  )
}

/**
 * Aggregate coverage metrics across multiple files
 * @param {CoverageSummary[]} coverages - Array of coverage summaries to aggregate
 * @returns {CoverageSummary} The aggregated coverage summary
 */
function aggregateCoverage(coverages: CoverageSummary[]): CoverageSummary {
  // Validate array parameter
  if (!Array.isArray(coverages)) {
    return {
      statements: { total: 0, covered: 0, pct: 0 },
      branches: { total: 0, covered: 0, pct: 0 },
      functions: { total: 0, covered: 0, pct: 0 },
      lines: { total: 0, covered: 0, pct: 0 },
    }
  }

  if (coverages.length === 0) {
    return {
      statements: { total: 0, covered: 0, pct: 0 },
      branches: { total: 0, covered: 0, pct: 0 },
      functions: { total: 0, covered: 0, pct: 0 },
      lines: { total: 0, covered: 0, pct: 0 },
    }
  }

  const aggregate = {
    statements: { total: 0, covered: 0, pct: 0 },
    branches: { total: 0, covered: 0, pct: 0 },
    functions: { total: 0, covered: 0, pct: 0 },
    lines: { total: 0, covered: 0, pct: 0 },
  }

  // Sum totals and covered counts
  for (const coverage of coverages) {
    aggregate.statements.total += coverage.statements.total
    aggregate.statements.covered += coverage.statements.covered
    aggregate.branches.total += coverage.branches.total
    aggregate.branches.covered += coverage.branches.covered
    aggregate.functions.total += coverage.functions.total
    aggregate.functions.covered += coverage.functions.covered
    aggregate.lines.total += coverage.lines.total
    aggregate.lines.covered += coverage.lines.covered
  }

  // Calculate percentages
  aggregate.statements.pct =
    aggregate.statements.total > 0
      ? (aggregate.statements.covered / aggregate.statements.total) * 100
      : 0
  aggregate.branches.pct =
    aggregate.branches.total > 0 ? (aggregate.branches.covered / aggregate.branches.total) * 100 : 0
  aggregate.functions.pct =
    aggregate.functions.total > 0
      ? (aggregate.functions.covered / aggregate.functions.total) * 100
      : 0
  aggregate.lines.pct =
    aggregate.lines.total > 0 ? (aggregate.lines.covered / aggregate.lines.total) * 100 : 0

  return aggregate
}

/**
 * Group coverage data by module
 * @param {Record<string, CoverageSummary>} fileCoverage - File coverage data to group
 * @returns {Map<string, { type: ModuleType; coverages: CoverageSummary[] }>} Grouped coverage by module
 */
function groupCoverageByModule(
  fileCoverage: Record<string, CoverageSummary>,
): Map<string, { type: ModuleType; coverages: CoverageSummary[] }> {
  const moduleGroups = new Map<string, { type: ModuleType; coverages: CoverageSummary[] }>()

  for (const [filePath, coverage] of Object.entries(fileCoverage)) {
    const moduleName = getModuleName(filePath)
    const moduleType = getModuleType(filePath)

    const existing = moduleGroups.get(moduleName)
    if (existing) {
      existing.coverages.push(coverage)
    } else {
      moduleGroups.set(moduleName, { type: moduleType, coverages: [coverage] })
    }
  }

  return moduleGroups
}

/**
 * Validate module coverage against layer-based thresholds
 * @param {CoverageSummary} coverage - The coverage summary for a module
 * @param {number} threshold - The coverage threshold percentage to validate against
 * @returns {Object} Object with status and failures array
 */
function validateModuleCoverage(
  coverage: CoverageSummary,
  threshold: number,
): { status: CoverageStatus; failures: string[] } {
  const failures: string[] = []
  const warningThreshold = threshold - WARNING_THRESHOLD_OFFSET

  const metrics = [
    { name: 'statements', value: coverage.statements.pct },
    { name: 'branches', value: coverage.branches.pct },
    { name: 'functions', value: coverage.functions.pct },
    { name: 'lines', value: coverage.lines.pct },
  ]

  const minCoverage = getMinCoverage(coverage)

  // Determine status based on minimum coverage
  let status: CoverageStatus
  if (minCoverage >= threshold) {
    status = 'passing'
  } else if (minCoverage >= warningThreshold) {
    status = 'warning'
  } else {
    status = 'error'
  }

  // Collect failures for metrics below threshold
  for (const metric of metrics) {
    if (metric.value < threshold) {
      failures.push(`${metric.name}: ${metric.value.toFixed(1)}% (need ${threshold}%)`)
    }
  }

  return { status, failures }
}

// =============================================================================
// CHECK DEFINITION
// =============================================================================

/**
 * Check: quality/code-coverage
 *
 * Validates code coverage meets layer-based thresholds (ADR-035).
 * Reads existing coverage reports - does NOT run tests.
 *
 * @see ADR-035 Code Coverage Requirements
 */
export const codeCoverage = defineCheck({
  id: 'dea3349d-7514-4a6f-b974-fa98f57de3ce',
  slug: 'code-coverage',
  scope: { languages: ['typescript'], concerns: ['backend', 'server'] },

  confidence: 'medium',
  description:
    'Validates code coverage meets layer-based thresholds (Foundational 95%, Shared 90%, Services 85%)',
  longDescription: `**Purpose:** Enforces per-module code coverage thresholds based on architectural layer, as defined in ADR-035.

**Detects:**
- Missing or stale \`coverage/coverage-summary.json\` reports (older than 60 minutes)
- Modules in the foundational layer below 95% coverage (statements, branches, functions, lines)
- Modules in the shared/infrastructure/domain layer below 90% coverage
- Modules in the services/apps/vertical layer below 85% coverage

**Why it matters:** Layer-appropriate coverage thresholds ensure foundational code (used everywhere) has the highest reliability, while allowing practical thresholds for higher-level code.

**Scope:** Codebase-specific convention enforcing ADR-035. Cross-file analysis via \`analyzeAll\`; reads existing Vitest/Istanbul coverage reports (does NOT run tests).`,
  tags: ['testing', 'code-quality', 'maintainability', 'adr-035', 'quality'],
  fileTypes: ['ts', 'tsx'],
  disabled: true, // Requires running pnpm test:coverage first; run manually: pnpm sip fit --check quality/code-coverage

  // @fitness-ignore-next-line concurrency-safety -- async keyword required by analyzeAll interface contract; synchronous analysis implementation
  async analyzeAll(): Promise<CheckViolation[]> {
    const violations: CheckViolation[] = []
    const cwd = process.cwd()

    // Check if coverage report exists and is recent
    const { isStale, reason } = checkReportAge(cwd)

    if (isStale) {
      const reportPath = getCoverageReportPath(cwd)
      violations.push({
        filePath: reportPath,
        line: 1,
        message: `${reason}. Run '${TEST_COVERAGE_CMD}' to generate fresh coverage data.`,
        severity: 'error',
        type: 'STALE_REPORT',
        suggestion: `Run '${TEST_COVERAGE_CMD}' to generate fresh coverage data, then re-run fitness checks`,
        match: COVERAGE_SUMMARY_FILENAME,
      })
      return violations
    }

    // Parse coverage report
    const fileCoverage = parseVitestCoverage(cwd)

    if (!fileCoverage) {
      const reportPath = getCoverageReportPath(cwd)
      violations.push({
        filePath: reportPath,
        line: 1,
        message: `Unable to parse coverage report. Please ensure '${TEST_COVERAGE_CMD}' completed successfully.`,
        severity: 'error',
        type: 'PARSE_ERROR',
        suggestion: `Ensure '${TEST_COVERAGE_CMD}' completes successfully and generates valid JSON in coverage/coverage-summary.json`,
        match: COVERAGE_SUMMARY_FILENAME,
      })
      return violations
    }

    // Group coverage by module
    const moduleGroups = groupCoverageByModule(fileCoverage)

    // Calculate per-module coverage
    for (const [moduleName, { type, coverages }] of moduleGroups.entries()) {
      const aggregated = aggregateCoverage(coverages)
      const threshold = getModuleThreshold(type)
      const validation = validateModuleCoverage(aggregated, threshold)

      // Add violations for non-passing modules
      if (validation.status !== 'passing') {
        const minCoverage = getMinCoverage(aggregated)
        const missingCoverage = threshold - minCoverage
        violations.push({
          filePath: moduleName, // Module path as identifier
          line: 1,
          message: `Module '${moduleName}' coverage below threshold: ${minCoverage.toFixed(1)}% (need ${threshold}%). ${validation.failures.join(', ')}`,
          severity: validation.status === 'error' ? 'error' : 'warning',
          type: `COVERAGE_${validation.status.toUpperCase()}`,
          suggestion: `Add tests for '${moduleName}' to increase coverage by ${missingCoverage.toFixed(1)}%. Focus on: ${validation.failures.slice(0, 2).join(', ')}`,
          match: moduleName,
        })
      }
    }

    return violations
  },
})
