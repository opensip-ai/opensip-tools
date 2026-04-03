// @fitness-ignore-file project-readme-existence -- internal module, not a package root
// @fitness-ignore-file fitness-check-coverage -- check implementation with framework-managed coverage
/**
 * @fileoverview No Hardcoded Path Exclusions check
 * @module cli/devtools/fitness/src/checks/quality/no-hardcoded-path-exclusions
 *
 * Enforces that fitness checks use the targets system (opensip-tools.config.yml)
 * and @fitness-ignore-file directives for file scoping, rather than
 * hardcoding ALLOWED_PATHS / EXCLUDED_PATHS arrays in check definitions.
 */

import { defineCheck, type CheckViolation } from '@opensip-tools/core'

/**
 * Detects arrays of path strings used for file-level exclusion/inclusion.
 * Matches patterns like:
 *   const ALLOWED_PATHS = [
 *   const EXCLUDED_PATHS = [
 *   const ALLOWED_IN_PATHS = [
 */
// eslint-disable-next-line sonarjs/slow-regex -- alternations have distinct prefixes; [^=\n]+ bounded by '=' delimiter
const PATH_ARRAY_PATTERN = /(?:const|let|var)\s+(?:ALLOWED|EXCLUDED|EXEMPT|SKIP|IGNORE)[A-Z_]*(?:PATHS?|DIRS?|FILES?)\s*(?::\s*[^=\n]+)?\s*=\s*\[/

/**
 * Check: quality/no-hardcoded-path-exclusions
 *
 * Detects fitness checks that hardcode path-based exclusions instead of
 * using the targets system. Checks should be portable — file scoping
 * belongs in opensip-tools.config.yml, exemptions use @fitness-ignore-file.
 */
export const noHardcodedPathExclusions = defineCheck({
  id: 'a7b8c9d0-e1f2-4a3b-5c6d-7e8f9a0b1c2d',
  slug: 'no-hardcoded-path-exclusions',
  scope: { languages: ['typescript'], concerns: ['fitness'] },
  contentFilter: 'code-only',

  confidence: 'medium',
  description: 'Detects hardcoded ALLOWED_PATHS/EXCLUDED_PATHS in fitness checks — use targets system instead',
  longDescription: `**Purpose:** Enforce that fitness checks delegate file scoping to the targets system.

**Detects:**
- \`ALLOWED_PATHS\`, \`EXCLUDED_PATHS\`, or similar arrays in check definitions
- Any constant matching the pattern \`ALLOWED|EXCLUDED|EXEMPT|SKIP|IGNORE\` + \`PATHS|DIRS|FILES\`

**Why it matters:** Hardcoded path exclusions make checks non-portable. The targets system (\`opensip-tools.config.yml\`) is the single source of truth for which files a check scans. Implementation exemptions should use \`@fitness-ignore-file\` directives.

**Fix:** Remove the hardcoded path array. Instead:
1. Declare a \`scope\` in \`defineCheck()\` or use \`checkOverrides\` in \`opensip-tools.config.yml\`
2. Add \`@fitness-ignore-file <check-slug>\` to files that legitimately need exemption`,
  tags: ['quality', 'architecture', 'portability', 'fitness-checks'],
  fileTypes: ['ts'],

  analyze(content: string, _filePath: string): CheckViolation[] {
    const violations: CheckViolation[] = []
    const lines = content.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line) continue

      const trimmed = line.trim()
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue
      }

      if (PATH_ARRAY_PATTERN.test(line)) {
        violations.push({
          line: i + 1,
          message: 'Hardcoded path exclusion array — use targets system (opensip-tools.config.yml) and @fitness-ignore-file directives instead',
          severity: 'warning',
          suggestion: 'Declare scope in defineCheck() or use checkOverrides in opensip-tools.config.yml; use @fitness-ignore-file for implementation exemptions',
          match: trimmed,
          type: 'hardcoded-path-exclusion',
        })
      }
    }

    return violations
  },
})
