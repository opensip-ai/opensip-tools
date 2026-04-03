// @fitness-ignore-file file-length-limits -- checkIdAndSlug validates 15+ structural constraints (UUID, slug format, display entry, barrel export) that share analysis context
// @fitness-ignore-file duplicate-implementation-detection -- similar patterns across diagnostic modules
/**
 * @fileoverview Fitness Check Architecture Enforcement
 * @module packages/fitness/src/checks/quality/fitness-check-architecture
 *
 * Validates that fitness checks follow the v2 framework architecture:
 *
 * 1. Use defineCheck() from the framework
 * 2. Export the check as a named constant
 * 3. Use proper UUID id, kebab-case slug, and valid category
 * 4. Category field matches directory location
 */

import { defineCheck, type CheckViolation } from '@opensip-tools/core'

// =============================================================================
// CONSTANTS
// =============================================================================

const EXCLUDED_PATTERNS = [
  /__tests__\//,
  /\.test\.ts$/,
  /\.spec\.ts$/,
  /\/index\.ts$/,
  /\/dist\//,
  /\.d\.ts$/,
]

const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const KEBAB_CASE_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

// =============================================================================
// ANALYSIS FUNCTIONS
// =============================================================================

function isCheckImplementationFile(filePath: string): boolean {
  if (!filePath.includes('/checks/')) return false
  if (filePath.endsWith('/index.ts')) return false
  if (EXCLUDED_PATTERNS.some((p) => p.test(filePath))) return false
  return true
}

function analyzeFile(content: string, filePath: string): CheckViolation[] {
  const violations: CheckViolation[] = []

  // Skip helper/utility files that don't define a check
  if (!/defineCheck\s*\(\{/.test(content)) return violations

  checkDefinePattern(content, violations)
  checkIdAndSlug(content, violations)
  checkTagsField(content, violations)
  checkExports(content, violations)

  return violations
}

function checkDefinePattern(content: string, violations: CheckViolation[]): void {
  // @fitness-ignore-next-line sonarjs-backend -- Safe regex matching import statement with bounded character class
  const importsDefine = /import\s+\{[^}]*\bdefineCheck\b[^}]*\}\s+from\s+['"][^'"]*framework[^'"]*['"]/.test(content)
  const callsDefine = /defineCheck\s*\(\{/.test(content)

  if (!importsDefine || !callsDefine) {
    violations.push({
      line: 1,
      message: 'Check does not use defineCheck() from the framework',
      severity: 'error',
      suggestion: "Import defineCheck from '@opensip-tools/core' and use defineCheck({...})",
      type: 'missing-define-check',
    })
  }
}

function checkIdAndSlug(content: string, violations: CheckViolation[]): void {
  const lines = content.split('\n')

  // Find id field in defineCheck config
  const idMatch = content.match(/export\s+const\s+\w+\s*=\s*defineCheck\s*\(\{[\s\S]*?id\s*:\s*['"]([^'"]+)['"]/)
  if (idMatch?.[1]) {
    const id = idMatch[1]
    if (!UUID_PATTERN.test(id)) {
      const lineNum = findLine(lines, 'id:', id)
      violations.push({
        line: lineNum,
        message: `Check ID "${id}" is not a valid UUID`,
        severity: 'error',
        suggestion: 'Use a plain UUID for the check id (e.g., a1b2c3d4-e5f6-7890-abcd-ef1234567890)',
        type: 'invalid-check-id',
      })
    }
  }

  // Find slug field — supports both inline string literals and constant references
  const slugMatch = content.match(/export\s+const\s+\w+\s*=\s*defineCheck\s*\(\{[\s\S]*?slug\s*:\s*['"]([^'"]+)['"]/)
  // Also check for slug: CONSTANT_REF pattern and resolve the constant value
  const slugConstMatch = content.match(/export\s+const\s+\w+\s*=\s*defineCheck\s*\(\{[\s\S]*?slug\s*:\s*([A-Z_][A-Z_0-9]*)\s*[,\n]/)
  let resolvedSlug: string | undefined = slugMatch?.[1]
  if (!resolvedSlug && slugConstMatch?.[1]) {
    // Resolve the constant value from the same file
    // @fitness-ignore-next-line semgrep-scan -- non-literal RegExp is intentional; slugConstMatch[1] is an identifier name matched by [A-Z_][A-Z_0-9]* regex, not user input
    const constValueMatch = content.match(new RegExp(`const\\s+${slugConstMatch[1]}\\s*=\\s*['"]([^'"]+)['"]`))
    resolvedSlug = constValueMatch?.[1]
  }

  if (!resolvedSlug) {
    const lineNum = findLine(lines, 'defineCheck')
    violations.push({
      line: lineNum,
      message: 'Check definition is missing a slug field',
      severity: 'error',
      suggestion: "Add slug: 'kebab-case-name' to the check definition",
      type: 'missing-slug',
    })
  } else if (!KEBAB_CASE_PATTERN.test(resolvedSlug)) {
    const lineNum = findLine(lines, 'slug:', resolvedSlug)
    violations.push({
      line: lineNum,
      message: `Check slug "${resolvedSlug}" is not valid kebab-case`,
      severity: 'error',
      suggestion: 'Use kebab-case format: lowercase-with-hyphens',
      type: 'invalid-slug',
    })
  }
}

function checkTagsField(content: string, violations: CheckViolation[]): void {
  const lines = content.split('\n')
  const tagsMatch = content.match(/tags\s*:\s*\[/)

  if (!tagsMatch) {
    violations.push({
      line: findLine(lines, 'defineCheck'),
      message: 'Check definition is missing a tags field',
      severity: 'error',
      suggestion: "Add tags: ['quality'] (or appropriate tags) to the check definition",
      type: 'missing-tags',
    })
  }
}

function checkExports(content: string, violations: CheckViolation[]): void {
  // @fitness-ignore-next-line sonarjs-backend -- Safe regex with fixed tokens for export detection
  if (!/export\s+(?:const|function)\s+\w+/.test(content)) {
    violations.push({
      line: 1,
      message: 'Check is not exported',
      severity: 'error',
      suggestion: 'Export the check: export const myCheck = defineCheck({ ... })',
      type: 'missing-export',
    })
  }
}

function findLine(lines: string[], needle: string, needle2?: string): number {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (line.includes(needle) && (!needle2 || line.includes(needle2))) return i + 1
  }
  return 1
}

// =============================================================================
// CHECK DEFINITION
// =============================================================================

export const fitnessCheckArchitecture = defineCheck({
  id: '6209f462-704f-4293-996d-e4bf4eb7a253',
  slug: 'fitness-check-architecture',
  scope: { languages: ['typescript'], concerns: ['fitness'] },
  contentFilter: 'raw',

  confidence: 'medium',
  description: 'Validate fitness checks follow v2 framework architecture',
  longDescription: `**Purpose:** Validates that fitness check files follow the v2 framework architecture patterns.

**Detects:**
- Missing \`defineCheck()\` import/call from the framework
- Check IDs not in UUID format
- Missing or invalid \`slug\` (must be kebab-case)
- Missing or invalid \`category\` field
- Category not matching the file's directory location under \`checks/\`
- Missing named export

**Why it matters:** Consistent architecture ensures checks are discoverable, properly categorized, and compatible with the framework.

**Excluded:** Index files, test files, type declarations, built output.`,
  tags: ['quality', 'internal', 'architecture', 'best-practices'],
  fileTypes: ['ts'],

  analyze(content, filePath): CheckViolation[] {
    if (!isCheckImplementationFile(filePath)) return []
    return analyzeFile(content, filePath)
  },
})
