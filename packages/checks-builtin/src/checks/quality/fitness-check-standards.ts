// @fitness-ignore-file file-length-limits -- meta-check: validates 10+ structural properties of fitness checks (analyze signature, file types, scope, category) sharing AST context
// @fitness-ignore-file batch-operation-limits -- iterates bounded collections (config entries, registry items, or small analysis results)
/**
 * @fileoverview Fitness Check Standards Enforcement
 * @module packages/fitness/src/checks/quality/fitness-check-standards
 *
 * Validates that fitness checks follow required v2 framework standards:
 * 1. Has analyze or analyzeAll function
 * 2. Has fileTypes array
 * 3. Has description field
 * 4. Regex patterns use bounded quantifiers (ReDoS safety)
 */

import { defineCheck, type CheckViolation } from '@opensip-tools/core'
import { isCommentLine } from '../../utils/index.js'

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

// =============================================================================
// ANALYSIS
// =============================================================================

function isCheckImplementationFile(filePath: string): boolean {
  if (!filePath.includes('/checks/')) return false
  if (filePath.endsWith('/index.ts')) return false
  if (EXCLUDED_PATTERNS.some((p) => p.test(filePath))) return false
  return true
}

function analyzeFile(content: string): CheckViolation[] {
  const violations: CheckViolation[] = []
  const lines = content.split('\n')

  // Only analyze files that use defineCheck
  if (!/defineCheck\s*\(\{/.test(content)) return violations

  checkAnalyzeFunction(content, lines, violations)
  checkFileTypes(content, lines, violations)
  checkDescription(content, lines, violations)
  checkRegexPatterns(lines, violations)

  return violations
}

/** Check 1: Has analyze or analyzeAll function */
function checkAnalyzeFunction(content: string, lines: string[], violations: CheckViolation[]): void {
  const hasAnalyze = /\banalyze\s*[:(]/.test(content) || /\banalyze\b\s*,/.test(content)
  const hasAnalyzeAll = /\banalyzeAll\s*[:(]/.test(content) || /\banalyzeAll\b\s*,/.test(content)
  const hasCommand = /\bcommand\s*:\s*\{/.test(content)

  if (!hasAnalyze && !hasAnalyzeAll && !hasCommand) {
    violations.push({
      line: findLine(lines, 'defineCheck'),
      message: 'Check is missing analyze, analyzeAll, or command property',
      severity: 'error',
      suggestion: 'Add analyze(content, filePath) or analyzeAll(files) to the check definition',
      type: 'missing-analyze',
    })
  }
}

/** Check 2: Has fileTypes */
function checkFileTypes(content: string, lines: string[], violations: CheckViolation[]): void {
  if (/fileTypes\s*:\s*\[/.test(content)) return
  // command-based checks may not need fileTypes
  if (/\bcommand\s*:\s*\{/.test(content)) return

  violations.push({
    line: findLine(lines, 'defineCheck'),
    message: 'Check is missing fileTypes array',
    severity: 'warning',
    suggestion: "Add fileTypes: ['ts'] (or appropriate extensions) to the check definition",
    type: 'missing-file-types',
  })
}

/** Check 3: Has description */
function checkDescription(content: string, lines: string[], violations: CheckViolation[]): void {
  if (/description\s*:\s*['"`]/.test(content)) return

  violations.push({
    line: findLine(lines, 'defineCheck'),
    message: 'Check is missing description field',
    severity: 'error',
    suggestion: 'Add a description string to the check definition',
    type: 'missing-description',
  })
}

/** Check 4: Regex patterns use bounded quantifiers (ReDoS safety) */
const DANGEROUS_REGEX_PATTERNS = [
  /\(\.\*\)\+/,
  /\(\.\+\)\*/,
  /\(\.\+\)\+/,
  /\(\.\*\)\*/,
]

function checkRegexPatterns(lines: string[], violations: CheckViolation[]): void {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (isCommentLine(line)) continue

    const regexLiteralMatch = line.match(/\/[^/]+\//g)
    if (regexLiteralMatch) {
      for (const regex of regexLiteralMatch) {
        if (DANGEROUS_REGEX_PATTERNS.some((p) => p.test(regex))) {
          violations.push({
            line: i + 1,
            message: 'Regex pattern may have catastrophic backtracking (ReDoS vulnerability)',
            severity: 'warning',
            suggestion: 'Use bounded quantifiers like {0,100} instead of * or + with nested groups',
            type: 'unbounded-regex',
          })
        }
      }
    }

    if (/new\s+RegExp\s*\(/.test(line) && /\(\.\*\)\+|\(\.\+\)\*|\(\.\+\)\+/.test(line)) {
      violations.push({
        line: i + 1,
        message: 'RegExp constructor with nested quantifiers may be vulnerable to ReDoS',
        severity: 'warning',
        suggestion: 'Use bounded quantifiers or add @fitness-ignore comment with justification',
        type: 'unbounded-regex',
      })
    }
  }
}

function findLine(lines: string[], needle: string): number {
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] ?? '').includes(needle)) return i + 1
  }
  return 1
}

// =============================================================================
// CHECK DEFINITION
// =============================================================================

export const fitnessCheckStandards = defineCheck({
  id: '9ebcb2d1-fafc-42c4-a76c-897f4ee7cfb1',
  slug: 'fitness-check-standards',
  scope: { languages: ['typescript'], concerns: ['fitness'] },
  contentFilter: 'raw',
  description: 'Validate fitness checks follow required v2 framework standards',
  longDescription: `**Purpose:** Meta-fitness check that enforces v2 framework standards across all fitness check implementations.

**Detects:**
- Missing \`analyze\`, \`analyzeAll\`, or \`command\` property
- Missing \`fileTypes\` array
- Missing \`description\` field
- Dangerous regex patterns with nested quantifiers (ReDoS vulnerability)

**Why it matters:** Standardized patterns ensure checks work correctly with the framework's execution pipeline.

**Excluded:** Index files, test files, type declarations, built output.`,
  tags: ['quality', 'internal', 'meta', 'standards'],
  fileTypes: ['ts'],
  confidence: 'medium',

  analyze(content, filePath): CheckViolation[] {
    if (!isCheckImplementationFile(filePath)) return []
    return analyzeFile(content)
  },
})
