// @fitness-ignore-file no-raw-regex-on-code -- fitness check: regex patterns analyze trusted codebase content, not user input
/**
 * @fileoverview Route Schema Coverage Check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/code-structure/route-schema-coverage
 * @version 1.0.0
 *
 * Ensures Fastify routes define Zod schemas for all request/response shapes
 * and use type inference instead of manual casts.
 */

import { defineCheck, type CheckViolation } from '@opensip-tools/core'

/** Matches Fastify route definitions: fastify.get(, fastify.post(, etc. */
const ROUTE_METHOD_PATTERN = /fastify\.(get|post|patch|put|delete)\s*\(/

/** Matches schema blocks missing a response key */
const SCHEMA_WITHOUT_RESPONSE = /schema\s*:\s*\{(?![^}]*response\s*:)[^}]*\}/s

/** Matches type assertion anti-patterns on request properties */
const TYPE_ASSERTION_PATTERNS = [
  /request\.body\s+as\s+/,
  /request\.params\s+as\s+/,
  /request\.query\s+as\s+/,
]

/** Matches inline Zod schema definitions */
const INLINE_ZOD_PATTERN = /z\.object\s*\(\s*\{/

/** File-level exemption directives */
const FILE_EXEMPTIONS = [
  '@fitness-ignore-file route-schema-coverage',
  '@fitness-ignore-file fastify-schema-coverage',
]

/** Line-level exemption directive */
const LINE_EXEMPTION = '@fitness-ignore-next-line route-schema-coverage'

/**
 * Check if a file has a file-level exemption directive.
 */
function hasFileExemption(content: string): boolean {
  // Check the first 10 lines for file-level directives
  const headerLines = content.split('\n').slice(0, 10)
  return headerLines.some((line) =>
    FILE_EXEMPTIONS.some((directive) => line.includes(directive)),
  )
}

/**
 * Check if a line is covered by a previous-line exemption directive.
 */
function hasLineExemption(lines: readonly string[], lineIndex: number): boolean {
  if (lineIndex === 0) return false
  const prevLine = lines[lineIndex - 1] ?? ''
  return prevLine.includes(LINE_EXEMPTION)
}

/**
 * Check if a file is inside the apiserver routes directory.
 */
function isRouteFile(filePath: string): boolean {
  return filePath.includes('services/apiserver/src/routes/')
}

/**
 * Check if a file is inside the api-schemas package (should not be flagged for inline schemas).
 */
function isApiSchemasFile(filePath: string): boolean {
  return filePath.includes('packages/api-schemas/')
}

/**
 * Detect missing response schemas in route definition blocks.
 */
function detectMissingResponseSchemas(
  content: string,
  lines: readonly string[],
): CheckViolation[] {
  const violations: CheckViolation[] = []

  SCHEMA_WITHOUT_RESPONSE.lastIndex = 0
  const match = SCHEMA_WITHOUT_RESPONSE.exec(content)
  if (match) {
    // Find the line number of the match
    const upToMatch = content.slice(0, match.index)
    const lineNum = upToMatch.split('\n').length

    if (!hasLineExemption(lines, lineNum - 1)) {
      violations.push({
        line: lineNum,
        column: 0,
        message: 'Route schema block missing response definition',
        severity: 'warning',
        suggestion:
          'Add a response schema to the route schema block (e.g., response: { 200: MyResponseSchema })',
        type: 'missing-response-schema',
        match: (lines[lineNum - 1] ?? '').trim(),
      })
    }
  }

  return violations
}

/**
 * Detect type assertion anti-patterns on request properties.
 */
function detectTypeAssertions(lines: readonly string[]): CheckViolation[] {
  const violations: CheckViolation[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const lineNum = i + 1

    // Skip lines with TODO acknowledgements
    if (line.includes('// TODO')) continue

    // Skip exempted lines
    if (hasLineExemption(lines, i)) continue

    for (const pattern of TYPE_ASSERTION_PATTERNS) {
      pattern.lastIndex = 0
      if (pattern.test(line)) {
        violations.push({
          line: lineNum,
          column: 0,
          message: 'Type assertion on request property — use Fastify Zod type inference instead',
          severity: 'warning',
          suggestion:
            'Define request schemas in the route schema config and rely on Fastify type inference from Zod schemas',
          type: 'type-assertion-on-request',
          match: line.trim(),
        })
        break
      }
    }
  }

  return violations
}

/**
 * Detect inline Zod schema definitions in route files.
 */
function detectInlineSchemas(
  lines: readonly string[],
  filePath: string,
): CheckViolation[] {
  const violations: CheckViolation[] = []

  // Only flag inline schemas in apiserver routes, never in api-schemas package
  if (!isRouteFile(filePath) || isApiSchemasFile(filePath)) return []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const lineNum = i + 1

    // Skip exempted lines
    if (hasLineExemption(lines, i)) continue

    INLINE_ZOD_PATTERN.lastIndex = 0
    if (INLINE_ZOD_PATTERN.test(line)) {
      violations.push({
        line: lineNum,
        column: 0,
        message: 'Inline Zod schema in route file — import from a shared schema module instead',
        severity: 'warning',
        suggestion:
          'Move the Zod schema to a dedicated schema package and import it in the route file',
        type: 'inline-zod-schema',
        match: line.trim(),
      })
    }
  }

  return violations
}

/**
 * Check: quality/route-schema-coverage
 *
 * Ensures Fastify routes define Zod schemas for all request/response shapes
 * and use type inference instead of manual casts.
 */
export const routeSchemaCoverage = defineCheck({
  id: 'fec9fb19-cb92-4dd7-9642-1b080b10765e',
  slug: 'route-schema-coverage',
  description:
    'Fastify routes must define Zod schemas for all request/response shapes and use type inference instead of manual casts',
  longDescription: `**Purpose:** Ensures Fastify route definitions include proper Zod schema modeling for type-safe request/response handling.

**Detects:**
- Route schema blocks missing a \`response\` definition
- Type assertions on \`request.body\`, \`request.params\`, or \`request.query\` (indicates missing Zod type inference)
- Inline \`z.object({\` definitions in route files instead of imports from a dedicated schema package

**Skips:**
- Files without Fastify route method calls
- Lines with \`// TODO\` acknowledgements (for type assertions)
- Files with \`@fitness-ignore-file route-schema-coverage\` or \`@fitness-ignore-file fastify-schema-coverage\`
- Lines with \`@fitness-ignore-next-line route-schema-coverage\`
- Inline schema detection is scoped to \`services/apiserver/src/routes/\` only

**Why it matters:** Without schema definitions, Fastify routes lose compile-time type safety and runtime validation, leading to undetected contract violations and type mismatches.`,
  scope: { languages: ['typescript'], concerns: ['backend', 'server'] },
  tags: ['quality', 'schema', 'api'],
  fileTypes: ['ts'],
  confidence: 'high',

  analyze(content, filePath): CheckViolation[] {
    // Skip files with file-level exemptions
    if (hasFileExemption(content)) return []

    // Skip non-route files: must contain at least one Fastify route method call
    ROUTE_METHOD_PATTERN.lastIndex = 0
    if (!ROUTE_METHOD_PATTERN.test(content)) return []

    const lines = content.split('\n')
    const violations: CheckViolation[] = []

    violations.push(...detectMissingResponseSchemas(content, lines))
    violations.push(...detectTypeAssertions(lines))
    violations.push(...detectInlineSchemas(lines, filePath))

    return violations
  },
})
