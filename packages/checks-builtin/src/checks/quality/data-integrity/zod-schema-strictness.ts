/**
 * @fileoverview Zod schema strictness check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/data-integrity/zod-schema-strictness
 * @version 1.0.0
 */

import { defineCheck, type CheckViolation } from '@opensip-tools/core'

/** Field names that typically accept user input and need length constraints */
const USER_INPUT_FIELDS = [
  'name',
  'title',
  'description',
  'message',
  'comment',
  'bio',
  'content',
  'label',
  'displayname',
]

/**
 * Analyze Zod schemas for missing validation constraints
 */
function analyzeZodStrictness(content: string, filePath: string): CheckViolation[] {
  const violations: CheckViolation[] = []

  // Skip api-schemas package — these schemas are used for Fastify response serialization
  // where strict constraints cause 500 errors when DB values don't match
  if (filePath.includes('packages/api-schemas/')) {
    return violations
  }

  // Skip response schema files — response schemas can't have strict constraints
  if (/response/i.test(filePath)) {
    return violations
  }

  // Skip files that export response schemas
  if (/export\s+(?:const|type)\s+\w*[Rr]esponse[Ss]chema/.test(content)) {
    return violations
  }

  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()

    // Skip comments
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue

    // Check for z.string() on user-input fields without length limits
    const stringFieldMatch = trimmed.match(
      // eslint-disable-next-line sonarjs/slow-regex -- lookahead scans remainder of single line; bounded by line length
      /(\w+)\s*:\s*z\.string\(\)(?![^\n]*\.(?:min|max|length|email|url|uuid|regex|ip|datetime|trim)\()/,
    )
    if (stringFieldMatch?.[1]) {
      const fieldName = stringFieldMatch[1]
      if (USER_INPUT_FIELDS.some((f) => fieldName.toLowerCase().includes(f))) {
        violations.push({
          line: i + 1,
          message: `User-facing string field '${fieldName}' has z.string() without length constraints`,
          severity: 'warning',
          suggestion:
            'Add .min(1).max(N) to prevent empty strings and unbounded input: z.string().min(1).max(500)',
          type: 'unbounded-string',
          match: trimmed.slice(0, 120),
        })
      }
    }
  }

  return violations
}

/**
 * Check: quality/zod-schema-strictness
 *
 * Checks Zod schemas for missing validation constraints on user-facing fields.
 */
export const zodSchemaStrictness = defineCheck({
  id: '14d68146-a27d-409a-9e8d-aee1e8336c14',
  slug: 'zod-schema-strictness',
  scope: { languages: ['typescript'], concerns: ['backend', 'server'] },
  contentFilter: 'code-only',

  confidence: 'medium',
  description: 'Checks Zod schemas for missing validation constraints on user-facing fields',
  longDescription: `**Purpose:** Checks Zod schemas for user-facing string fields that lack length constraints, which could accept unbounded input.

**Detects:**
- \`z.string()\` on fields named like user input (name, title, description, message, comment, bio, content, label) without \`.min()\`, \`.max()\`, \`.length()\`, or other refinements

**Why it matters:** Unbounded string fields can accept arbitrarily large input, causing storage, memory, and display issues.

**Scope:** Contracts and schema files. Analyzes each file individually via regex.`,
  tags: ['quality', 'zod', 'validation', 'data-integrity'],
  fileTypes: ['ts'],
  analyze: analyzeZodStrictness,
})
