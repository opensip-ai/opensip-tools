// @fitness-ignore-file toctou-race-condition -- TOCTOU acceptable in this non-concurrent context
/**
 * @fileoverview Duplicate Interface Detection check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/code-structure/duplicate-interface-detection
 * @version 2.0.0
 *
 * Detects duplicate interface/type definitions across the codebase.
 * Enforces canonical type locations per CLAUDE.md guidelines.
 */

import { basename } from 'node:path'

import * as ts from 'typescript'

import { defineCheck, type CheckViolation, type FileAccessor } from '@opensip-tools/core'
import { getSharedSourceFile } from '@opensip-tools/core/framework/parse-cache.js'

/**
 * Check if type alias is simple (just renaming a primitive or single reference)
 */
function isSimpleTypeAlias(node: ts.TypeAliasDeclaration): boolean {
  const type = node.type

  // Primitive types
  if (
    type.kind === ts.SyntaxKind.StringKeyword ||
    type.kind === ts.SyntaxKind.NumberKeyword ||
    type.kind === ts.SyntaxKind.BooleanKeyword
  ) {
    return true
  }

  // Single type reference (e.g., type Foo = Bar)
  if (ts.isTypeReferenceNode(type) && !type.typeArguments) {
    return true
  }

  // Literal types
  if (ts.isLiteralTypeNode(type)) {
    return true
  }

  return false
}

/**
 * Extract interface/type definitions from a file
 */
function extractTypeDefinitions(
  filePath: string,
  content: string,
): Array<{ name: string; line: number }> {
  const definitions: Array<{ name: string; line: number }> = []

  try {
    const sourceFile = getSharedSourceFile(filePath, content)
    if (!sourceFile) return []

    const visit = (node: ts.Node) => {
      // Check interface declarations
      if (ts.isInterfaceDeclaration(node)) {
        const name = node.name.text
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart())

        // Skip internal/private interfaces (prefixed with _)
        if (!name.startsWith('_')) {
          definitions.push({ name, line: line + 1 })
        }
      }

      // Check type alias declarations
      if (ts.isTypeAliasDeclaration(node)) {
        const name = node.name.text
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart())

        // Skip internal/private types and simple type aliases
        if (!name.startsWith('_') && !isSimpleTypeAlias(node)) {
          definitions.push({ name, line: line + 1 })
        }
      }

      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
  } catch {
    // @swallow-ok Ignore parse errors
  }

  return definitions
}

/**
 * Check: quality/duplicate-interface-detection
 *
 * Detects duplicate interface/type definitions that violate canonical type locations.
 */
export const duplicateInterfaceDetection = defineCheck({
  id: '05001667-eb91-4d96-a939-fa24520b1218',
  slug: 'duplicate-interface-detection',
  scope: { languages: ['typescript'], concerns: ['backend', 'frontend', 'cli'] },

  confidence: 'high',
  description:
    'Detect duplicate interface/type definitions (4+ occurrences) and recommend canonical locations',
  longDescription: `**Purpose:** Detects interface and type alias definitions that appear in 4+ files, indicating they should be moved to a canonical shared location per CLAUDE.md guidelines.

**Detects:** Cross-file analysis using TypeScript AST to extract interface and type alias declarations.
- Interface declarations (\`interface Foo { ... }\`) defined in 4+ different files
- Non-trivial type alias declarations (\`type Foo = { ... }\`) defined in 4+ files
- Skips private/internal names prefixed with \`_\` and simple type aliases (primitives, single references, literals)

**Why it matters:** Duplicate type definitions create maintenance burden and risk divergence. Types used across files should live in canonical locations: \`foundation/types\` for cross-layer, \`infrastructure/types\` for infra, or \`services/<domain>/types\` for domain-specific.

**Scope:** Codebase-specific convention enforcing canonical type locations`,
  tags: ['quality', 'dry', 'types', 'interfaces', 'canonical'],
  fileTypes: ['ts'],

  async analyzeAll(files: FileAccessor): Promise<CheckViolation[]> {
    // Collect all interface/type definitions
    const typeDefinitions = new Map<string, Array<{ file: string; line: number }>>()

    // @fitness-ignore-next-line performance-anti-patterns -- false positive: keyword in comment text below, not an async call
    // @lazy-ok -- validations in subsequent loops depend on data collected from await
    for (const filePath of files.paths) {
      try {
        // @fitness-ignore-next-line performance-anti-patterns -- sequential file reading to control memory; FileAccessor is lazy
        const content = await files.read(filePath)
        const definitions = extractTypeDefinitions(filePath, content)

        for (const def of definitions) {
          const existing = typeDefinitions.get(def.name) ?? []
          existing.push({ file: filePath, line: def.line })
          typeDefinitions.set(def.name, existing)
        }
      } catch {
        // @swallow-ok Skip unreadable files
      }
    }

    // Build violations for duplicates
    const violations: CheckViolation[] = []

    // Threshold: only flag if same name appears in 4+ files (per CLAUDE.md)
    const DUPLICATE_THRESHOLD = 4

    for (const [name, locations] of typeDefinitions) {
      if (locations.length >= DUPLICATE_THRESHOLD) {
        // Report the first occurrence with info about duplicates
        const first = locations[0]
        if (!first) continue

        const fileList = locations // @fitness-ignore-next-line performance-anti-patterns -- string join on small bounded array (max 4 elements)
          .slice(0, 4)
          .map((l) => basename(l.file))
          .join(', ')
        const moreCount = locations.length > 4 ? ` (+${locations.length - 4} more)` : ''

        violations.push({
          line: first.line,
          message: `Interface/type '${name}' defined in ${locations.length} files`,
          severity: 'warning',
          suggestion: `Move '${name}' to a shared types module (e.g., a cross-layer types package, infra types, or services/<domain>/types for domain-specific). Files: ${fileList}${moreCount}`,
          type: 'duplicate-interface',
          match: name,
          filePath: first.file,
        })
      }
    }

    return violations
  },
})
