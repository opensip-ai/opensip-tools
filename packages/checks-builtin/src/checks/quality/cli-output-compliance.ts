// @fitness-ignore-file unused-config-options -- Config options reserved for future use or environment-specific
/**
 * @fileoverview Enforce CLI output consistency using CLIWriter
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/cli-output-compliance
 * @version 2.0.0
 */

import { defineCheck, type CheckViolation } from '@opensip-tools/core'

/**
 * Pattern to find console.log, console.error, etc. calls
 */
const CONSOLE_PATTERN = /\bconsole\.(log|error|warn|info|debug)\s*\(/g

/**
 * Pattern to find CLIWriter import
 */
const CLI_WRITER_IMPORT_PATTERN = /@opensip\/core\/cli|@platform\/cli\/output|CLIWriter/

/**
 * Pattern to find context import (for CLI context pattern)
 * Matches various relative paths to context modules, with optional .js extension
 */
const CONTEXT_IMPORT_PATTERN =
  /from\s+['"](?:\.\.?\/)(?:\.\.\/)*(?:cli\/)?context(?:\.js)?['"]|\/cli\/context/

const FILE_IGNORE_CLI_COMPLIANCE_PATTERN = /@fitness-ignore-file\s+quality\/cli-output-compliance/
const FILE_IGNORE_CONSOLE_PATTERN =
  /@fitness-ignore-file\s+quality\/(no-console-log|cli-output-compliance)/
const LINE_IGNORE_CONSOLE_PATTERN =
  /@fitness-ignore-next-line\s+quality\/(no-console-log|cli-output-compliance)/

function hasFileIgnoreDirective(lines: string[], pattern: RegExp): boolean {
  return lines.slice(0, 50).some((line) => pattern.test(line))
}

function checkBinFileCompliance(content: string): CheckViolation | null {
  const hasCliWriter = CLI_WRITER_IMPORT_PATTERN.test(content)
  const hasContext = CONTEXT_IMPORT_PATTERN.test(content)

  if (hasCliWriter || hasContext) {
    return null
  }

  const lines = content.split('\n')
  if (hasFileIgnoreDirective(lines, FILE_IGNORE_CLI_COMPLIANCE_PATTERN)) {
    return null
  }

  return {
    line: 1,
    column: 0,
    message:
      'CLI bin file should use a structured CLI writer module or import context module',
    severity: 'warning',
    suggestion:
      'Import a CLI writer module or create a cli/context.ts module and import from there',
  }
}

function findConsoleViolationsInLine(line: string, lineNumber: number): CheckViolation[] {
  const violations: CheckViolation[] = []
  CONSOLE_PATTERN.lastIndex = 0
  let match
  while ((match = CONSOLE_PATTERN.exec(line)) !== null) {
    violations.push({
      line: lineNumber,
      column: match.index,
      message: `Use CLIWriter output helpers instead of console.${match[1]}`,
      severity: 'warning',
      suggestion:
        'Replace with output() helper that uses CLIWriter context, or add @fitness-ignore-next-line cli-output-compliance if intentional',
      match: match[0],
    })
  }
  return violations
}

function checkCommandFileCompliance(content: string): CheckViolation[] {
  const violations: CheckViolation[] = []
  const lines = content.split('\n')

  if (hasFileIgnoreDirective(lines, FILE_IGNORE_CONSOLE_PATTERN)) {
    return violations
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line === undefined) continue

    const prevLine = i > 0 ? lines[i - 1] : ''
    const hasLineIgnore = prevLine !== undefined && LINE_IGNORE_CONSOLE_PATTERN.test(prevLine)
    if (hasLineIgnore) continue

    const lineViolations = findConsoleViolationsInLine(line, i + 1)
    violations.push(...lineViolations)
  }

  return violations
}

/**
 * Check: quality/cli-output-compliance
 *
 * Ensures CLI tools use the unified CLIWriter system for output:
 * 1. CLI bin files should import a CLI writer module or use context
 * 2. CLI command files should not have bare console.log calls
 * 3. All console.log calls should use the fitness-ignore directive if intentional
 */
export const cliOutputCompliance = defineCheck({
  id: 'd930b5c8-386a-40ee-a52d-60abeda45264',
  slug: 'cli-output-compliance',
  scope: { languages: ['typescript'], concerns: ['cli'] },
  contentFilter: 'raw',

  confidence: 'medium',
  description: 'Enforce CLI output consistency using CLIWriter',
  longDescription: `**Purpose:** Ensures all CLI tools use the unified CLIWriter system for output instead of raw console calls.

**Detects:**
- CLI bin files missing imports from a CLI writer module, \`CLIWriter\`, or \`cli/context\`
- \`console.log\`, \`console.error\`, \`console.warn\`, \`console.info\`, \`console.debug\` calls in CLI command files

**Why it matters:** Consistent CLI output through CLIWriter enables structured formatting, testability, and unified UX across all CLI tools.

**Scope:** Codebase-specific convention. Analyzes each file individually. Targets CLI bin and command files.`,
  tags: ['cli', 'output', 'quality'],
  fileTypes: ['ts'],

  analyze(content, filePath): CheckViolation[] {
    const violations: CheckViolation[] = []
    const isBinFile = /\/bin\/[^/]+$/.test(filePath)
    const isCliSourceFile = filePath.includes('/apps/cli/src/')
    const isCommandFile = filePath.includes('/commands/')

    if (isBinFile) {
      const binViolation = checkBinFileCompliance(content)
      if (binViolation) {
        violations.push(binViolation)
      }
      // Don't also run the console check on bin files — they have their own validation above
      return violations
    }

    // Check all CLI source files (commands, shared utilities, formatters)
    if (isCommandFile || isCliSourceFile) {
      const commandViolations = checkCommandFileCompliance(content)
      violations.push(...commandViolations)
    }

    return violations
  },
})
