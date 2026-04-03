// @fitness-ignore-file fitness-check-standards -- Uses fs for package/tsconfig reading, not source file content
// @fitness-ignore-file duplicate-implementation-detection -- similar patterns across diagnostic modules
// @fitness-ignore-file detached-promises -- analyzeAll is async by interface contract but implementation is synchronous; fs calls are sync
/**
 * @fileoverview TypeScript Build Configuration check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/architecture/typescript-build-configuration
 * @version 2.0.0
 *
 * Ensures all backend packages follow standardized TypeScript build configuration:
 * - tsconfig.json has rootDir and outDir set
 * - package.json build script compiles TypeScript (not "no build needed")
 * - package.json exports point to ./dist/*.js, not ./src/*.ts
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

import { defineCheck, type CheckViolation, type FileAccessor } from '@opensip-tools/core'

/** Backend packages that should be compiled */
const _BACKEND_PACKAGE_PATTERNS = [
  'packages/core/',
  'packages/fitness/',
  'packages/tickets/',
  'packages/signals/',
  'packages/simulation/',
  'packages/sip/',
  'packages/assess/',
  'packages/api-client/',
  'apps/cli/',
  'services/apiserver/',
]

interface PackageConfig {
  name: string
  packagePath: string
  packageJsonPath: string
  tsconfigPath: string
  hasRootDir: boolean
  hasOutDir: boolean
  hasProperBuildScript: boolean
  hasSourceExports: boolean
  buildScript?: string | undefined
  exportsSample?: string | undefined
}

/**
 * Parse a JSON file safely
 */
function parseJsonFile<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null
    const stats = fs.statSync(filePath)
    if (stats.size > 10_000_000) return null
    const content = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as T
  } catch {
    // @swallow-ok graceful degradation - return sentinel on failure
    return null
  }
}

interface TsConfig {
  compilerOptions?: {
    rootDir?: string
    outDir?: string
  }
}

interface PackageJson {
  name?: string
  main?: string
  exports?: Record<string, unknown>
  scripts?: {
    build?: string
  }
}

/**
 * Check if exports point to source files instead of dist
 */
function hasSourceExports(exports: Record<string, unknown> | undefined): {
  hasSource: boolean
  sample?: string
} {
  if (!exports) return { hasSource: false }

  for (const [key, value] of Object.entries(exports)) {
    if (typeof value === 'string') {
      if (value.includes('./src/') && value.endsWith('.ts')) {
        return { hasSource: true, sample: `"${key}": "${value}"` }
      }
    } else if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>
      const importValue = obj['import'] || obj['default']
      if (
        typeof importValue === 'string' &&
        importValue.includes('./src/') &&
        importValue.endsWith('.ts')
      ) {
        return { hasSource: true, sample: `"${key}": { import: "${importValue}" }` }
      }
    }
  }

  return { hasSource: false }
}

/**
 * Analyze a package's build configuration
 */
function analyzePackage(packageJsonPath: string, projectRoot: string): PackageConfig | null {
  const packageDir = path.dirname(packageJsonPath)
  const relativePath = path.relative(projectRoot, packageDir)
  const tsconfigPath = path.join(packageDir, 'tsconfig.json')

  const pkg = parseJsonFile<PackageJson>(packageJsonPath)
  if (!pkg) return null

  const tsconfig = parseJsonFile<TsConfig>(tsconfigPath)

  // Also check tsconfig.build.json - packages with cross-package path mappings
  // use a separate build config with rootDir to avoid TS6059 errors
  const tsconfigBuildPath = path.join(packageDir, 'tsconfig.build.json')
  const tsconfigBuild = parseJsonFile<TsConfig>(tsconfigBuildPath)

  const buildScript = pkg.scripts?.build
  const hasProperBuildScript = !!(
    buildScript &&
    !buildScript.includes('echo') &&
    !buildScript.includes('no build needed') &&
    (buildScript.includes('tsc') || buildScript.includes('typescript'))
  )

  const { hasSource, sample } = hasSourceExports(pkg.exports)

  return {
    name: pkg.name || path.basename(packageDir),
    packagePath: relativePath,
    packageJsonPath,
    tsconfigPath,
    hasRootDir: !!tsconfig?.compilerOptions?.rootDir || !!tsconfigBuild?.compilerOptions?.rootDir,
    hasOutDir: !!tsconfig?.compilerOptions?.outDir || !!tsconfigBuild?.compilerOptions?.outDir,
    hasProperBuildScript,
    hasSourceExports: hasSource,
    buildScript,
    exportsSample: sample,
  }
}

/**
 * Collect violations for a single package's build configuration.
 */
function collectPackageViolations(config: PackageConfig, violations: CheckViolation[]): void {
  // Check for missing rootDir
  if (!config.hasRootDir && fs.existsSync(config.tsconfigPath)) {
    violations.push({
      filePath: config.tsconfigPath,
      line: 1,
      message: `Package '${config.name}' tsconfig.json is missing rootDir configuration`,
      severity: 'error',
      suggestion: 'Add "rootDir": "./src" to compilerOptions in tsconfig.json',
      match: 'rootDir',
      type: 'missing-rootdir',
    })
  }

  // Check for missing outDir
  if (!config.hasOutDir && fs.existsSync(config.tsconfigPath)) {
    violations.push({
      filePath: config.tsconfigPath,
      line: 1,
      message: `Package '${config.name}' tsconfig.json is missing outDir configuration`,
      severity: 'error',
      suggestion: 'Add "outDir": "./dist" to compilerOptions in tsconfig.json',
      match: 'outDir',
      type: 'missing-outdir',
    })
  }

  // Check for improper build script
  if (!config.hasProperBuildScript) {
    violations.push({
      filePath: config.packageJsonPath,
      line: 1,
      message: `Package '${config.name}' has improper build script: "${config.buildScript || 'none'}"`,
      severity: 'error',
      suggestion: 'Update build script to "tsc && tsc-esm-fix --target dist"',
      match: 'build',
      type: 'improper-build-script',
    })
  }

  // Check for source exports
  if (config.hasSourceExports) {
    violations.push({
      filePath: config.packageJsonPath,
      line: 1,
      message: `Package '${config.name}' exports point to source files instead of dist`,
      severity: 'error',
      suggestion: 'Update exports to point to ./dist/*.js instead of ./src/*.ts',
      match: 'exports',
      type: 'source-exports',
    })
  }
}

/**
 * Check: architecture/typescript-build-configuration
 *
 * Ensures all backend packages follow standardized TypeScript build configuration.
 */
export const typescriptBuildConfiguration = defineCheck({
  id: 'fc44f3ba-6dea-430b-860f-7afca864a23b',
  slug: 'typescript-build-configuration',
  scope: { languages: ['json', 'typescript', 'yaml'], concerns: ['config'] },

  confidence: 'medium',
  description: 'Ensures standardized TypeScript build configuration across backend packages',
  longDescription: `**Purpose:** Ensures all backend packages follow standardized TypeScript build configuration for consistent compilation and packaging.

**Detects:**
- Missing \`rootDir\` in \`tsconfig.json\` \`compilerOptions\`
- Missing \`outDir\` in \`tsconfig.json\` \`compilerOptions\`
- Improper build scripts (missing \`tsc\`, contains \`echo\` or \`no build needed\`)
- Package \`exports\` pointing to \`./src/*.ts\` instead of \`./dist/*.js\`

**Why it matters:** Inconsistent build configuration causes packages to ship source files instead of compiled output, breaking consumers and creating unpredictable module resolution.

**Scope:** Codebase-specific convention. Cross-file analysis via \`analyzeAll\`.`,
  tags: ['architecture', 'build', 'typescript'],
  fileTypes: ['json'],

  // @fitness-ignore-next-line concurrency-safety -- async keyword required by analyzeAll interface contract; synchronous analysis implementation
  async analyzeAll(files: FileAccessor): Promise<CheckViolation[]> {
    const violations: CheckViolation[] = []

    const cwd = process.cwd()

    // Only process package.json files, not tsconfig.json or other JSON
    const packageJsonPaths = files.paths.filter((p) => path.basename(p) === 'package.json')

    for (const packageJsonPath of packageJsonPaths) {
      // Skip root workspace package.json (not a buildable package)
      const relPath = path.relative(cwd, packageJsonPath)
      if (relPath === 'package.json') continue

      // Skip packages that use bundlers instead of tsc (e.g. Vite-based dashboard)
      if (packageJsonPath.includes('apps/dashboard/')) continue

      const config = analyzePackage(packageJsonPath, cwd)
      if (!config) continue

      collectPackageViolations(config, violations)
    }

    return violations
  },
})
