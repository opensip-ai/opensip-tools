/**
 * @fileoverview Enforce file headers with @invariants annotations
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/code-structure/file-headers
 * @version 2.0.0
 */

import { defineCheck, type CheckViolation } from '@opensip-tools/core'

// Tier 1 modules that cannot use "standard" invariants
const TIER1_PATHS = [
  'escrow',
  'payments',
  'settlement',
  'authentication',
  'authorization',
  'security',
]

/**
 * Valid @see pattern: ADR-XXX with optional description
 * Examples:
 *   @see ADR-052
 *   @see ADR-052 - Adapter Factory Pattern
 *   @see ADR-052 (Adapter Factory Pattern)
 */
const VALID_SEE_PATTERN = /^@see\s+ADR-\d{3}(?:\s|$)/

/**
 * Invalid @see pattern: file paths or .md references
 */
const INVALID_SEE_FILE_PATH_PATTERN = /@see\s+(?:docs\/|[^\s]+\.md)/

/**
 * Check if a file is a Tier 1 module using standard invariants (violation)
 * @param filePath - The file path to check
 * @param headerContent - The header content to search
 * @returns True if this is a Tier 1 violation
 */
function isTier1StandardInvariantViolation(filePath: string, headerContent: string): boolean {
  const isTier1 = TIER1_PATHS.some((p) => filePath.includes(`/${p}/`))
  if (!isTier1) return false

  const invariantsMatch = headerContent.match(/@invariants\s+(\w+)/)
  return invariantsMatch?.[1] === 'standard'
}

/**
 * Find invalid @see tags in header content
 * @param lines - Lines of the header content
 * @returns Array of {lineNumber, line} for invalid @see tags
 */
function findInvalidSeeTags(lines: string[]): Array<{ lineNumber: number; line: string }> {
  const invalidTags: Array<{ lineNumber: number; line: string }> = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line?.includes('@see')) continue

    // Extract the @see portion
    const seeMatch = line.match(/@see\s+.*/)
    if (!seeMatch) continue

    const seeContent = seeMatch[0]

    // Check if it matches the valid ADR pattern
    if (VALID_SEE_PATTERN.test(seeContent)) continue

    // Check if it's an invalid file path reference
    if (INVALID_SEE_FILE_PATH_PATTERN.test(seeContent)) {
      invalidTags.push({ lineNumber: i + 1, line })
    }
  }

  return invalidTags
}

/**
 * Check: quality/file-headers
 *
 * Ensures all TypeScript files have proper headers with @invariants tags.
 * Tier 1 critical modules must have explicit invariants, not just "standard".
 * @see tags must use ADR-XXX format, not file paths.
 */
export const fileHeaders = defineCheck({
  id: '0ec4d82e-c1c8-4ec2-b207-f6916cf67686',
  slug: 'file-headers',
  scope: { languages: ['typescript'], concerns: ['backend', 'frontend', 'cli'] },
  contentFilter: 'raw',

  confidence: 'medium',
  description: 'Enforce file headers with @invariants annotations',
  longDescription: `**Purpose:** Ensures all TypeScript files have proper JSDoc headers with \`@invariants\` annotations, and validates that \`@see\` tags reference ADR numbers rather than file paths.

**Detects:** Analyzes each file individually by inspecting the first 50 lines.
- Missing \`@invariants\` tag in file header (error)
- Tier 1 critical modules (escrow, payments, settlement, authentication, authorization, security) using \`@invariants standard\` instead of explicit constraints (error)
- \`@see\` tags referencing file paths (e.g., \`@see docs/adr/052-...\`) instead of ADR numbers (e.g., \`@see ADR-052\`) (warning)

**Why it matters:** \`@invariants\` annotations document safety/correctness constraints for AI agents and reviewers. ADR-number references survive file renames; file path references become stale.

**Scope:** Codebase-specific convention enforcing ADR-061`,
  tags: ['documentation', 'adr-061', 'quality', 'ai-annotations'],
  fileTypes: ['ts', 'tsx'],
  disabled: true, // Disabled: opensip does not enforce file header format

  analyze(content: string, filePath: string): CheckViolation[] {
    const violations: CheckViolation[] = []

    // Check first 50 lines for header
    const lines = content.split('\n').slice(0, 50)
    const headerContent = lines.join('\n')

    // Check for @invariants tag
    const hasInvariantsTag = headerContent.includes('@invariants')
    if (!hasInvariantsTag) {
      violations.push({
        line: 1,
        message: 'Missing @invariants tag in file header',
        severity: 'error',
        suggestion:
          'Add @invariants tag in file header JSDoc. Use @invariants standard for non-critical modules or specify explicit invariants for Tier 1 modules.',
        match: '@invariants',
        filePath,
      })
    } else if (isTier1StandardInvariantViolation(filePath, headerContent)) {
      // Tier 1 module using "standard" invariants - violation
      const invariantLine = lines.findIndex((l) => l.includes('@invariants')) + 1
      violations.push({
        line: invariantLine,
        message:
          'Tier 1 modules cannot use @invariants standard - must specify explicit constraints',
        severity: 'error',
        suggestion:
          'Replace @invariants standard with explicit invariants describing the safety/correctness constraints for this critical module.',
        match: '@invariants standard',
        filePath,
      })
    }

    // Check for invalid @see tags (file paths instead of ADR numbers)
    const invalidSeeTags = findInvalidSeeTags(lines)
    for (const { lineNumber, line } of invalidSeeTags) {
      violations.push({
        line: lineNumber,
        message: '@see tag must use ADR-XXX format, not file paths',
        severity: 'warning',
        suggestion:
          'Replace @see with file path (e.g., @see docs/adr/052-...) with ADR number format (e.g., @see ADR-052 - Description). File paths become stale when documents are moved.',
        match: line.trim(),
        filePath,
      })
    }

    return violations
  },
})
