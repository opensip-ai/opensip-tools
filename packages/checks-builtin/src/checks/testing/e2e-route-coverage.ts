/**
 * @fileoverview E2E Route Coverage Check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/testing/e2e-route-coverage
 * @version 2.0.0
 *
 * Ensures all app routes have E2E test coverage in console-errors.spec.ts.
 * Compares Expo Router file-based routes against PAGES_TO_TEST arrays.
 */

import * as path from 'node:path'

import { logger } from '@opensip-tools/core/logger'
import { glob } from 'glob'

import { defineCheck, type CheckViolation, type FileAccessor } from '@opensip-tools/core'

/**
 * Route information
 */
interface RouteInfo {
  path: string
  file: string
  isDynamic: boolean
}

/**
 * Apps to check for E2E coverage.
 */
const APPS_TO_CHECK = [
  // External apps (customer-facing)
  { name: 'watches', path: 'external/watches' },
  { name: 'cards', path: 'external/cards' },
  // Internal apps (business tools)
  { name: 'platform-admin', path: 'internal/platform-admin' },
  { name: 'devtools', path: 'internal/devtools' },
]

/**
 * Files to exclude from route detection
 */
const FRAMEWORK_LAYOUT_FILES = ['_layout.tsx', '+not-found.tsx', '+html.tsx']

/**
 * File patterns that indicate layout/special files
 */
const EXCLUDED_PREFIXES = ['_', '+']

/**
 * Pre-compiled pattern for detecting dynamic route segments.
 * Uses bounded quantifier [^\\]]{1,100} instead of .+ to prevent ReDoS.
 */
const DYNAMIC_SEGMENT_PATTERN = /\[[^\]]{1,100}\]/

/**
 * Converts a file path to an Expo Router URL path
 */
function filePathToRoute(filePath: string, appDir: string): RouteInfo {
  logger.debug({
    evt: 'fitness.checks.e2e_route_coverage.file_path_to_route',
    msg: 'Converting file path to Expo Router URL path',
  })
  const relativePath = path.relative(appDir, filePath)

  // Remove .tsx extension
  let routePath = relativePath.replace(/\.tsx$/, '')

  // Handle index files
  routePath = routePath.replace(/\/index$/, '')
  if (routePath === 'index') routePath = ''

  // Check for dynamic segments using bounded pattern
  const isDynamic = DYNAMIC_SEGMENT_PATTERN.test(routePath)

  // Build final path
  const finalPath = '/' + routePath

  return {
    path: finalPath === '/' ? '/' : finalPath,
    file: filePath,
    isDynamic,
  }
}

/**
 * Check if a file should be included in route discovery
 */
function shouldIncludeRouteFile(fileName: string): boolean {
  logger.debug({
    evt: 'fitness.checks.e2e_route_coverage.should_include_route_file',
    msg: 'Checking if file should be included in route discovery',
  })
  // Skip excluded files
  if (FRAMEWORK_LAYOUT_FILES.includes(fileName)) {
    return false
  }

  // Skip files starting with excluded prefixes
  if (EXCLUDED_PREFIXES.some((prefix) => fileName.startsWith(prefix))) {
    return false
  }

  return true
}

/**
 * Discovers all route files in an app's app directory
 */
async function discoverAppRoutes(appPath: string): Promise<RouteInfo[]> {
  logger.debug({
    evt: 'fitness.checks.e2e_route_coverage.discover_app_routes',
    msg: 'Discovering all route files in app directory',
  })
  const appDir = `${appPath}/src/app`

  const files = await glob(`${appDir}/**/*.tsx`, {
    ignore: ['**/node_modules/**'],
  })

  // Filter files first to avoid continue statements in loop
  const validFiles = files.filter((file) => shouldIncludeRouteFile(path.basename(file)))

  return validFiles.map((file) => filePathToRoute(file, appDir))
}

/**
 * Pre-compiled patterns for parsing test file content.
 * Using bounded quantifiers to prevent ReDoS.
 */
const PAGES_TO_TEST_PATTERN = /const\s{0,10}PAGES_TO_TEST\s{0,10}=\s{0,10}\[([\s\S]{0,50000}?)\]/
const PATH_VALUE_PATTERN = /path:\s{0,10}['"]([^'"]{1,200})['"]/g

/**
 * Parses the PAGES_TO_TEST array from console-errors.spec.ts
 */
async function parseTestedPaths(specFile: string, files: FileAccessor): Promise<string[]> {
  logger.debug({
    evt: 'fitness.checks.e2e_route_coverage.parse_tested_paths',
    msg: 'Parsing PAGES_TO_TEST array from spec file',
  })
  // @lazy-ok -- validations depend on content from await
  try {
    const content = await files.read(specFile)

    // Find PAGES_TO_TEST array
    const match = content.match(PAGES_TO_TEST_PATTERN)
    if (!match) return []

    const arrayContent = match[1]
    if (!arrayContent) return []

    // Extract path values using pre-compiled pattern
    const pathMatches = arrayContent.matchAll(PATH_VALUE_PATTERN)
    return Array.from(pathMatches)
      .map((m) => m[1])
      .filter((p): p is string => p !== undefined)
  } catch {
    // @swallow-ok File doesn't exist or can't be read
    return []
  }
}

/**
 * Checks E2E coverage for a single app
 */
async function checkAppCoverage(
  appConfig: { name: string; path: string },
  repoRoot: string,
  files: FileAccessor,
): Promise<{
  routes: RouteInfo[]
  testedPaths: string[]
  missingPaths: string[]
  dynamicRoutes: RouteInfo[]
}> {
  logger.debug({
    evt: 'fitness.checks.e2e_route_coverage.check_app_coverage',
    msg: 'Checking E2E coverage for app',
  })
  const appPath = path.join(repoRoot, 'apps', appConfig.path)
  const specFile = path.join(appPath, 'e2e', 'console-errors.spec.ts')

  // Discover routes
  const routes = await discoverAppRoutes(appPath)

  // Parse tested paths
  const testedPaths = await parseTestedPaths(specFile, files)

  // Separate static and dynamic routes
  const staticRoutes = routes.filter((r) => !r.isDynamic)
  const dynamicRoutes = routes.filter((r) => r.isDynamic)

  // Find missing paths (only for static routes)
  const staticPaths = staticRoutes.map((r) => r.path)
  const missingPaths = staticPaths.filter((routePath) => !testedPaths.includes(routePath))

  return {
    routes,
    testedPaths,
    missingPaths,
    dynamicRoutes,
  }
}

/**
 * Analyze all files for E2E route coverage
 */
async function analyzeAll(files: FileAccessor): Promise<CheckViolation[]> {
  logger.debug({
    evt: 'fitness.checks.e2e_route_coverage.analyze_all',
    msg: 'Analyzing all files for E2E route coverage',
  })
  const violations: CheckViolation[] = []

  // Get the cwd from the first file path (all paths are absolute)
  const firstPath = files.paths[0]
  if (!firstPath) {
    return violations
  }

  // Find the repo root by looking for apps directory
  let cwd = path.dirname(firstPath)
  // @fitness-ignore-next-line lazy-loading -- E2E route coverage check: fs module dynamically imported to reduce module load time
  const fs = await import('node:fs')
  while (cwd !== '/' && !fs.existsSync(path.join(cwd, 'apps'))) {
    cwd = path.dirname(cwd)
  }

  // @fitness-ignore-next-line no-unbounded-concurrency -- bounded by fixed 4-element APPS_TO_CHECK array
  const coverageResults = await Promise.all(
    APPS_TO_CHECK.map((appConfig) => checkAppCoverage(appConfig, cwd, files).then((coverage) => ({ appConfig, coverage }))),
  )

  for (const { appConfig, coverage } of coverageResults) {
    // Create violations for missing paths
    for (const missingPath of coverage.missingPaths) {
      const route = coverage.routes.find((r) => r.path === missingPath)
      const specFile = path.join(cwd, 'apps', appConfig.path, 'e2e', 'console-errors.spec.ts')
      violations.push({
        line: 1,
        message: `Route ${missingPath} in ${appConfig.name} missing E2E test coverage`,
        severity: 'error',
        type: 'missing-coverage',
        suggestion: `Add { path: '${missingPath}', name: '${missingPath.replace(/\//g, ' ').trim() || 'Home'}' } to PAGES_TO_TEST array in ${specFile}`,
        match: missingPath,
        filePath: route?.file ?? path.join(cwd, 'apps', appConfig.path),
      })
    }
  }

  return violations
}

/**
 * Check: testing/e2e-route-coverage
 *
 * Ensures all app routes have E2E test coverage in console-errors.spec.ts.
 */
export const e2eRouteCoverage = defineCheck({
  id: '48a2a350-04cc-44f4-8aa7-3a4343519fbc',
  slug: 'e2e-route-coverage',
  scope: { languages: ['typescript'], concerns: ['backend', 'server'] },
  contentFilter: 'code-only',

  confidence: 'medium',
  description: 'Ensures all app routes have E2E test coverage in console-errors.spec.ts',
  longDescription: `**Purpose:** Ensures every Expo Router file-based route in each app has a corresponding entry in the \`PAGES_TO_TEST\` array of its \`console-errors.spec.ts\` E2E test file.

**Detects:**
- Static routes (non-dynamic \`.tsx\` files under \`src/app/\`) that are missing from the \`PAGES_TO_TEST\` array
- Converts file paths to URL routes, filtering out layout files (\`_layout.tsx\`, \`+not-found.tsx\`, \`+html.tsx\`) and files prefixed with \`_\` or \`+\`
- Parses the \`const PAGES_TO_TEST = [...]\` array via regex \`/const\\s{0,10}PAGES_TO_TEST\\s{0,10}=\\s{0,10}\\[([\\s\\S]{0,50000}?)\\]/\` and extracts \`path:\` values
- Checks apps: watches, cards, platform-admin, devtools

**Why it matters:** Prevents new routes from being deployed without basic E2E smoke test coverage, catching console errors and rendering failures early.

**Scope:** Codebase-specific convention. Cross-file analysis via \`analyzeAll\` comparing discovered routes against tested paths. Disabled by default.`,
  tags: ['testing', 'e2e', 'coverage'],
  fileTypes: ['ts', 'tsx'],
  disabled: true, // Requires e2e tests to be set up; run manually: pnpm sip fit --check testing/e2e-route-coverage

  analyzeAll,
})
