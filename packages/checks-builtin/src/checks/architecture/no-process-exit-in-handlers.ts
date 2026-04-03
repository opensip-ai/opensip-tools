// @fitness-ignore-file project-readme-existence -- internal module, not a package root
// @fitness-ignore-file fitness-check-coverage -- check implementation with framework-managed coverage
/**
 * @fileoverview Detects process.exit() in command handlers instead of top-level entry point
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/architecture/no-process-exit-in-handlers
 * @version 1.0.0
 */

import { defineCheck, type CheckViolation, getLineNumber } from '@opensip-tools/core'

/**
 * Pattern for detecting process.exit() calls
 */
const PROCESS_EXIT_PATTERN = /process\.exit\s*\(/g

/**
 * Check: architecture/no-process-exit-in-handlers
 *
 * Detects process.exit() calls in command handler files.
 * Only the top-level bin entry point should call process.exit() —
 * command handlers should throw errors or return results.
 */
export const noProcessExitInHandlers = defineCheck({
  id: '31a7535a-c7ff-4b94-80cc-3ffcc4e3b04e',
  slug: 'no-process-exit-in-handlers',
  scope: { languages: ['typescript'], concerns: ['backend', 'server'] },
  contentFilter: 'code-only',

  confidence: 'medium',
  description: 'Detect process.exit() in command handlers instead of entry point',
  longDescription: `**Purpose:** Enforces the architectural boundary that only the top-level CLI entry point (\`bin/opensip.ts\`) should call \`process.exit()\`. Command handlers, shared utilities, and other CLI code should communicate outcomes through return values, Result types, or thrown errors.

**Detects:**
- \`process.exit()\` calls in files under \`/commands/\`, \`/shared/\`, or general CLI source files (excluding the \`/bin/\` entry point)
- Skips test files and comment lines

**Why it matters:** Scattered \`process.exit()\` calls bypass cleanup logic, make testing difficult (can't assert on behavior if the process exits), and violate the single-responsibility principle of the entry point.

**Scope:** CLI architecture convention. Analyzes CLI source files individually via regex.`,
  tags: ['architecture', 'cli', 'process'],
  fileTypes: ['ts'],

  analyze(content: string, filePath: string): CheckViolation[] {
    const violations: CheckViolation[] = []

    // Only apply to CLI source files
    if (!filePath.includes('/apps/cli/')) {
      return violations
    }

    // Allow process.exit in the bin entry point — that's where it belongs
    if (/\/bin\/[^/]+$/.test(filePath)) {
      return violations
    }

    // Allow process.exit in signal/shutdown handlers — SIGINT/SIGTERM handlers
    // must call process.exit() because the signal was intercepted
    if (filePath.includes('shutdown') || filePath.includes('signal')) {
      return violations
    }

    // Skip test files
    if (filePath.includes('.test.') || filePath.includes('.spec.') || filePath.includes('__tests__')) {
      return violations
    }

    // Quick check
    if (!content.includes('process.exit')) {
      return violations
    }

    const lines = content.split('\n')
    PROCESS_EXIT_PATTERN.lastIndex = 0
    let match
    while ((match = PROCESS_EXIT_PATTERN.exec(content)) !== null) {
      const lineNumber = getLineNumber(content, match.index)
      const line = lines[lineNumber - 1] ?? ''
      const trimmed = line.trim()

      // Skip comment lines
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) {
        continue
      }

      violations.push({
        line: lineNumber,
        column: 0,
        message: 'process.exit() should only be called from the bin entry point, not command handlers',
        severity: 'warning',
        suggestion:
          'Throw a typed error or return a Result instead. Let the top-level bin error handler decide the exit code.',
        match: match[0],
        type: 'process-exit-in-handler',
        filePath,
      })
    }

    return violations
  },
})
