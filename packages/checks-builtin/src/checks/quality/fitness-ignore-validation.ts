// @fitness-ignore-file fitness-ignore-hygiene -- reason: validation check for ignore directives must reference directive patterns in its own logic, triggering false positives from hygiene check
/**
 * @fileoverview Fitness Ignore Directive Validation Check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/fitness-ignore-validation
 * @version 3.0.0
 *
 * Validates that @fitness-ignore directives in the codebase:
 * - Have correct format
 * - Reference valid check IDs
 * - Include meaningful reasons
 */

import {
  parseDirectiveLine,
  isWeakReason as isWeakReasonShared,
} from '@opensip-tools/core/framework/directive-inventory.js'
import { defineCheck, type CheckViolation } from '@opensip-tools/core'


/**
 * Check if a line looks like a malformed fitness-ignore directive.
 */
function isMalformedDirective(line: string): boolean {
  if (!line.includes('@fitness-ignore')) {
    return false
  }
  // Check if it starts with a fitness-ignore comment directive (with leading whitespace)
  const trimmed = line.trimStart()
  return trimmed.startsWith('// @fitness-ignore')
}

/**
 * Check if a check ID is valid
 */
function isValidCheckId(checkId: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(checkId)
}

/**
 * Check if a reason is weak/generic (non-null variant for this check's validation)
 */
function isWeakReason(reason: string): boolean {
  return isWeakReasonShared(reason)
}

/**
 * Check: quality/fitness-ignore-validation
 *
 * Validates @fitness-ignore directives have correct format, valid check IDs,
 * and meaningful reasons.
 */
export const fitnessIgnoreValidation = defineCheck({
  id: '054f875a-92cf-4daa-863b-6a25d7fc5a12',
  slug: 'fitness-ignore-validation',
  scope: { languages: ['typescript'], concerns: ['fitness'] },
  contentFilter: 'raw',
  description:
    'Validate @fitness-ignore directives have correct format, valid check IDs, and meaningful reasons',
  longDescription: `**Purpose:** Validates that \`@fitness-ignore\` directives in the codebase are well-formed, reference valid checks, and include meaningful justifications.

**Detects:**
- Malformed \`@fitness-ignore\` directives that don't match the expected format
- Check IDs that are not valid kebab-case (\`/^[a-z][a-z0-9-]*$/\`)
- Missing or weak/generic reasons on both \`@fitness-ignore-file\` and \`@fitness-ignore-next-line\` directives
- \`@fitness-ignore-file\` directives placed after line 50 (must be in file header)

**Why it matters:** Poorly justified or overly broad ignore directives silently suppress real violations. Valid, well-scoped directives maintain the integrity of fitness checks.

**Scope:** Codebase-specific convention. Analyzes each file individually (\`analyze\`). Targets production files.`,
  tags: ['quality', 'code-quality', 'best-practices'],
  fileTypes: ['ts', 'tsx'],
  confidence: 'medium',

  analyze(content, _filePath): CheckViolation[] {
    // Quick filter: skip files without @fitness-ignore
    if (!content.includes('@fitness-ignore')) {
      return []
    }

    const violations: CheckViolation[] = []
    const lines = content.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line) continue

      const lineNum = i + 1
      const directive = parseDirectiveLine(line)

      if (directive) {
        if (directive.type === 'file') {
          addFileLevelViolations(directive, lineNum, line, violations)
        } else {
          addNextLineViolations(directive, lineNum, line, violations)
        }
      } else if (isMalformedDirective(line)) {
        violations.push({
          line: lineNum,
          column: 0,
          message: 'Malformed @fitness-ignore directive',
          severity: 'error',
          type: 'invalid-format',
          suggestion:
            'Use format: // @fitness-ignore-next-line <check-id> -- <reason>. The check-id must be a valid kebab-case slug.',
          match: '@fitness-ignore',
        })
      }
    }

    return violations
  },
})

/**
 * Add violations for file-level directives.
 */
function addFileLevelViolations(
  directive: { checkId: string; reason: string | null },
  lineNum: number,
  _line: string,
  violations: CheckViolation[],
): void {
  const directiveCheckId = directive.checkId
  const reason = directive.reason?.trim()

  // Validate check ID
  if (directiveCheckId && !isValidCheckId(directiveCheckId)) {
    violations.push({
      line: lineNum,
      column: 0,
      message: `Unknown check ID in @fitness-ignore-file: ${directiveCheckId}`,
      severity: 'warning',
      type: 'unknown-check-id',
      suggestion: 'Use a valid kebab-case check ID (e.g., no-console-log, detached-promises)',
      match: directiveCheckId,
    })
  }

  // Validate reason
  if (!reason || isWeakReason(reason)) {
    violations.push({
      line: lineNum,
      column: 0,
      message: 'Missing or weak reason in @fitness-ignore-file directive',
      severity: 'warning',
      type: 'weak-reason',
      suggestion:
        'Provide a descriptive reason explaining why this ignore is necessary. Include specific context about why the rule does not apply.',
      match: reason ?? '@fitness-ignore-file',
    })
  }

  // File-level must be in first 50 lines
  if (lineNum > 50) {
    violations.push({
      line: lineNum,
      column: 0,
      message: '@fitness-ignore-file must be in the first 50 lines of the file',
      severity: 'error',
      type: 'invalid-placement',
      suggestion:
        'Move the @fitness-ignore-file directive to the file header (within first 50 lines). Place it near the top of the file after imports.',
      match: '@fitness-ignore-file',
    })
  }
}

/**
 * Add violations for next-line directives.
 */
function addNextLineViolations(
  directive: { checkId: string; reason: string | null },
  lineNum: number,
  _line: string,
  violations: CheckViolation[],
): void {
  const directiveCheckId = directive.checkId
  const reason = directive.reason?.trim()

  // Validate check ID
  if (directiveCheckId && !isValidCheckId(directiveCheckId)) {
    violations.push({
      line: lineNum,
      column: 0,
      message: `Unknown check ID in @fitness-ignore-next-line: ${directiveCheckId}`,
      severity: 'warning',
      type: 'unknown-check-id',
      suggestion: 'Use a valid kebab-case check ID (e.g., no-console-log, detached-promises)',
      match: directiveCheckId,
    })
  }

  // Validate reason
  if (!reason || isWeakReason(reason)) {
    violations.push({
      line: lineNum,
      column: 0,
      message: 'Missing or weak reason in @fitness-ignore-next-line directive',
      severity: 'warning',
      type: 'weak-reason',
      suggestion:
        'Provide a descriptive reason explaining why this ignore is necessary. Include specific context about why the rule does not apply.',
      match: reason ?? '@fitness-ignore-next-line',
    })
  }
}

