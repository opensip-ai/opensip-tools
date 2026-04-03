/**
 * @fileoverview Ensures all fitness checks have co-located unit tests
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/testing/fitness-check-coverage
 * @version 2.1.0
 *
 * Enforces ADR-053: All fitness checks must have co-located unit tests.
 * This check validates that every check file has a corresponding test file
 * in a __tests__ subdirectory (e.g., __tests__/<check-name>.test.ts or
 * __tests__/<check-name>.unit.test.ts).
 */
// @fitness-ignore-file fitness-check-standards -- Uses fs for directory listing/stat operations, not file content reading

import * as fs from 'node:fs'
import * as path from 'node:path'

import { logger } from '@opensip-tools/core/logger'

import { defineCheck, type CheckViolation, type FileAccessor } from '@opensip-tools/core'

/**
 * Fitness checks root directory (relative to project root)
 */
const CHECKS_ROOT = 'packages/fitness/src/checks'

/**
 * Categories to scan for check files
 */
const CATEGORIES = [
  'quality',
  'structure',
  'resilience',
  'testing',
  'architecture',
  'security',
  'performance',
  'documentation',
]

/**
 * Check if a check file has proper test coverage
 */
function checkTestCoverage(
  category: string,
  checkFileName: string,
  categoryPath: string,
): CheckViolation | null {
  logger.debug({
    evt: 'fitness.checks.fitness_check_coverage.check_test_coverage',
    msg: 'Checking if check file has proper test coverage',
  })
  const checkBaseName = checkFileName.replace(/\.ts$/, '')
  const testsDir = path.join(categoryPath, '__tests__')
  const relativePath = `${CHECKS_ROOT}/${category}`
  const checkFilePath = path.join(categoryPath, checkFileName)

  // Look for test files with various naming conventions
  const possibleTestFiles = [
    `${checkBaseName}.test.ts`,
    `${checkBaseName}.unit.test.ts`,
    `${checkBaseName}.spec.ts`,
  ]

  // Check if __tests__ directory exists
  if (!fs.existsSync(testsDir)) {
    return {
      line: 1,
      message: `Check '${checkBaseName}' missing test file (no __tests__ directory)`,
      severity: 'warning',
      type: 'MISSING_TESTS_DIR',
      suggestion: `Create test file: mkdir -p ${relativePath}/__tests__ && touch ${relativePath}/__tests__/${checkBaseName}.test.ts`,
      match: checkBaseName,
      filePath: checkFilePath,
    }
  }

  // Check for corresponding test file
  const hasTestFile = possibleTestFiles.some((testFile) =>
    fs.existsSync(path.join(testsDir, testFile)),
  )

  if (!hasTestFile) {
    return {
      line: 1,
      message: `Check '${checkBaseName}' has no corresponding test file`,
      severity: 'warning',
      type: 'NO_TEST_FILES',
      suggestion: `Add test file: touch ${relativePath}/__tests__/${checkBaseName}.test.ts`,
      match: checkBaseName,
      filePath: checkFilePath,
    }
  }

  return null
}

/**
 * Scan a single category for check files
 */
function scanCategory(category: string, categoryPath: string): CheckViolation[] {
  logger.debug({
    evt: 'fitness.checks.fitness_check_coverage.scan_category',
    msg: 'Scanning category for check files',
  })
  const violations: CheckViolation[] = []

  try {
    const entries = fs.readdirSync(categoryPath)

    // Filter to valid check files (*.ts, excluding index.ts, test files, and directories)
    const checkFiles = entries.filter((entry) => {
      // Skip directories, hidden files, and special directories
      if (entry.startsWith('__') || entry.startsWith('.')) return false
      const entryPath = path.join(categoryPath, entry)
      if (fs.statSync(entryPath).isDirectory()) return false
      // Only .ts files
      if (!entry.endsWith('.ts')) return false
      // Skip index.ts (barrel export) and test files
      if (entry === 'index.ts') return false
      if (entry.endsWith('.test.ts') || entry.endsWith('.spec.ts')) return false
      return true
    })

    for (const checkFile of checkFiles) {
      const violation = checkTestCoverage(category, checkFile, categoryPath)
      if (violation) {
        violations.push(violation)
      }
    }
  } catch {
    // @swallow-ok Can't read category directory
  }

  return violations
}

/**
 * Analyze all files for fitness check coverage
 */
// @fitness-ignore-next-line concurrency-safety -- async keyword required by analyzeAll interface contract; synchronous analysis implementation
async function analyzeAll(files: FileAccessor): Promise<CheckViolation[]> {
  logger.debug({
    evt: 'fitness.checks.fitness_check_coverage.analyze_all',
    msg: 'Analyzing all files for fitness check coverage',
  })
  // Get the cwd from the first file path (all paths are absolute)
  const firstPath = files.paths[0]
  if (!firstPath) {
    return []
  }

  // Find the repo root by looking for the checks directory
  let cwd = path.dirname(firstPath)
  while (cwd !== '/' && !fs.existsSync(path.join(cwd, CHECKS_ROOT))) {
    cwd = path.dirname(cwd)
  }

  const violations: CheckViolation[] = []

  for (const category of CATEGORIES) {
    const categoryPath = path.join(cwd, CHECKS_ROOT, category)
    if (!fs.existsSync(categoryPath)) continue

    const categoryViolations = scanCategory(category, categoryPath)
    violations.push(...categoryViolations)
  }

  return violations
}

/**
 * Check: testing/fitness-check-coverage
 *
 * Ensures all fitness checks have co-located unit tests (ADR-053).
 */
export const fitnessCheckCoverage = defineCheck({
  id: '93391961-6ebf-4586-ab82-e754bdfa6063',
  slug: 'fitness-check-coverage',
  scope: { languages: ['typescript'], concerns: ['fitness'] },

  confidence: 'medium',
  description: 'Ensures all fitness checks have co-located unit tests (ADR-053)',
  longDescription: `**Purpose:** Enforces ADR-053 requiring every fitness check file to have a co-located unit test in a \`__tests__\` subdirectory.

**Detects:**
- Check files in category directories (quality, structure, resilience, testing, architecture, security, performance, documentation) that have no \`__tests__/\` directory (\`MISSING_TESTS_DIR\`)
- Check files with no corresponding test file matching \`<check-name>.test.ts\`, \`<check-name>.unit.test.ts\`, or \`<check-name>.spec.ts\` (\`NO_TEST_FILES\`)
- Scans \`.ts\` files excluding \`index.ts\`, test files, hidden files, and directories

**Why it matters:** Fitness checks are critical quality gates -- untested checks can produce false positives or miss real violations, undermining confidence in the fitness system.

**Scope:** Codebase-specific convention enforcing ADR-053. Cross-file analysis via \`analyzeAll\` scanning the \`packages/fitness/src/checks\` directory tree.`,
  tags: ['testing', 'adr-053'],
  fileTypes: ['ts'],

  analyzeAll,
})
