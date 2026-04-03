// @fitness-ignore-file toctou-race-condition -- TOCTOU acceptable in this non-concurrent context
/**
 * @fileoverview ADR-032: Directory File Count Limits check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/code-structure/directory-file-limits
 * @version 2.0.0
 * @see ADR-032 - Directory File Limits
 *
 * This check ensures directories don't exceed TypeScript file count limits.
 * Large directories make code harder to navigate and may indicate poor organization.
 *
 * Thresholds per ADR-032:
 * - INFO: 10+ files (approaching limit)
 * - WARNING: 12+ files (consider reorganizing)
 * - ERROR: 15+ files (mandatory refactoring)
 */

import * as path from 'node:path'

import { defineCheck, type CheckViolation, type FileAccessor } from '@opensip-tools/core'

// =============================================================================
// CONSTANTS
// =============================================================================

// Thresholds from ADR-032
const INFO_THRESHOLD = 10
const WARNING_THRESHOLD = 12
const ERROR_THRESHOLD = 15

/**
 * Directories that have been reviewed and are intentionally cohesive.
 * Files in these directories are tightly related and splitting would
 * reduce navigability rather than improve it.
 */
const ALLOWED_DIRECTORIES = [
  // Fitness checks: each category directory contains many cohesive check files
  'packages/fitness/src/checks/quality',
  'packages/fitness/src/checks/quality/api',
  'packages/fitness/src/checks/quality/code-structure',
  'packages/fitness/src/checks/quality/data-integrity',
  'packages/fitness/src/checks/quality/devtools',
  'packages/fitness/src/checks/quality/frontend',
  'packages/fitness/src/checks/quality/linting',
  'packages/fitness/src/checks/quality/patterns',
  'packages/fitness/src/checks/architecture',
  'packages/fitness/src/checks/resilience',
  'packages/fitness/src/checks/testing',
  'packages/fitness/src/checks/security',
  // Fitness framework: tightly coupled framework modules
  'packages/fitness/src/framework',
  // Fitness recipes: cohesive recipe definitions
  'packages/fitness/src/recipes',
  // Assess package: assessment definitions organized by domain
  'packages/assess/src/assessments/module',
  'packages/assess/src/assessments/patterns',
  'packages/assess/src/assessments/security',
  'packages/assess/src/assessments/testing',
  'packages/assess/src/assessments/ui',
  // Core package: cohesive shared utilities
  'packages/core/src',
  'packages/core/src/cli',
  // SIP worker: pool + types + context form a cohesive worker lifecycle domain
  'packages/sip/src/worker',
  // SIP agent provider presets: one file per LLM provider, inherently parallel structure
  'packages/sip/src/agent-providers/presets',
  // API server SIP routes: orchestrator phases, adapters, and route handlers are tightly coupled
  'services/apiserver/src/routes/sip',
  // Dashboard components: presentational components organized by feature
  'apps/dashboard/src/components',
  // CLI commands: each command module is a top-level entry point
  'apps/cli/src/commands',
]

// =============================================================================
// TYPES
// =============================================================================

type Severity = 'INFO' | 'WARNING' | 'ERROR'

// =============================================================================
// ANALYSIS FUNCTIONS
// =============================================================================

/**
 * Check if file is a source file (not test, not type definition)
 */
function isSourceFile(filePath: string): boolean {
  // Must be TypeScript
  if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) {
    return false
  }
  // Skip type definitions
  if (filePath.endsWith('.d.ts')) {
    return false
  }
  // Skip test files per ADR-032
  if (filePath.includes('.test.') || filePath.includes('.spec.')) {
    return false
  }
  if (filePath.includes('/__tests__/')) {
    return false
  }
  return true
}

/**
 * Group files by directory
 */
function groupFilesByDirectory(files: readonly string[]): Map<string, string[]> {
  // Validate array parameter
  if (!Array.isArray(files)) {
    return new Map()
  }

  const directories = new Map<string, string[]>()

  for (const file of files) {
    if (!isSourceFile(file)) {
      continue
    }

    const dir = path.dirname(file)
    const existing = directories.get(dir) ?? []
    existing.push(file)
    directories.set(dir, existing)
  }

  return directories
}

/**
 * Get severity level for file count
 */
function getSeverity(fileCount: number): Severity | null {
  if (fileCount >= ERROR_THRESHOLD) {
    return 'ERROR'
  }
  if (fileCount >= WARNING_THRESHOLD) {
    return 'WARNING'
  }
  if (fileCount >= INFO_THRESHOLD) {
    return 'INFO'
  }
  return null
}

/**
 * Get recommendation message for severity
 */
function getRecommendation(severity: Severity): string {
  switch (severity) {
    case 'ERROR':
      return 'Mandatory refactoring required - see ADR-032 for restructuring guidance'
    case 'WARNING':
      return 'Consider reorganizing - review ADR-032 for common patterns'
    case 'INFO':
      return 'Directory approaching limits - begin planning reorganization'
    default:
      return 'Review directory structure'
  }
}

// =============================================================================
// CHECK DEFINITION
// =============================================================================

/**
 * Check: quality/directory-file-limits
 *
 * Ensures directories don't exceed TypeScript file count limits.
 * Counts only source files (excludes tests, type definitions).
 *
 * @see ADR-032 Directory File Limits
 */
export const directoryFileLimits = defineCheck({
  id: '3f830dc8-ecfc-4882-8818-6a34241f43b1',
  slug: 'directory-file-limits',
  scope: { languages: ['typescript'], concerns: ['backend', 'frontend', 'cli'] },

  confidence: 'medium',
  description: "Ensures directories don't exceed TypeScript file count limits",
  longDescription: `**Purpose:** Enforces ADR-032 directory file count limits to prevent directories from growing too large, which makes code harder to navigate and indicates poor organization.

**Detects:** Cross-file analysis by grouping all matched files by directory.
- Directories with 12+ TypeScript source files (warning)
- Directories with 15+ TypeScript source files (error, mandatory refactoring)
- Only counts source \`.ts\`/\`.tsx\` files (excludes \`.d.ts\`, test files, and \`__tests__/\` directories)
- Skips explicitly reviewed directories listed in \`ALLOWED_DIRECTORIES\`

**Why it matters:** Large directories signal poor module organization and make navigation difficult. Splitting by feature or domain improves discoverability and reduces merge conflicts.

**Scope:** Codebase-specific convention enforcing ADR-032`,
  tags: ['maintainability', 'best-practices', 'adr-032', 'quality'],
  fileTypes: ['ts', 'tsx'],
  docs: 'docs/adr/032-directory-file-limits.md',

  // @fitness-ignore-next-line concurrency-safety -- async keyword required by analyzeAll interface contract; synchronous analysis implementation
  async analyzeAll(files: FileAccessor): Promise<CheckViolation[]> {
    const violations: CheckViolation[] = []
    const directories = groupFilesByDirectory(files.paths)

    for (const [dirPath, filesInDir] of directories.entries()) {
      // Validate array parameter
      if (!Array.isArray(filesInDir)) {
        continue
      }

      // Skip directories that have been reviewed and approved
      if (ALLOWED_DIRECTORIES.some((allowed) => dirPath.endsWith(allowed))) {
        continue
      }

      const fileCount = filesInDir.length
      const severity = getSeverity(fileCount)

      if (!severity) continue

      const recommendation = getRecommendation(severity)

      // Only ERROR and WARNING are violations, INFO is just informational
      if (severity === 'INFO') continue

      const threshold = severity === 'ERROR' ? ERROR_THRESHOLD : WARNING_THRESHOLD

      violations.push({
        line: 1,
        message: `Directory '${dirPath}' has ${fileCount} files (threshold: ${threshold}). ${recommendation}`,
        severity: severity === 'ERROR' ? 'error' : 'warning',
        type: `FILE_COUNT_${severity}`,
        suggestion: `Split '${dirPath}' into subdirectories by feature or domain. Move related files into new folders like 'core/', 'utils/', 'types/', etc.`,
        match: path.basename(dirPath),
        filePath: dirPath,
      })
    }

    return violations
  },
})
