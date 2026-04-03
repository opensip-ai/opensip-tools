/**
 * @fileoverview OTel Span Coverage check
 *
 * Verifies that known boundary functions still contain span creation calls.
 * Prevents accidental removal of instrumentation during refactoring.
 */

import { defineCheck, type CheckViolation } from '@opensip-tools/core'

const INSTRUMENTED_BOUNDARIES: Array<{ pattern: string; expectedSpan: string }> = [
  { pattern: 'apiserver/src/agent/chat-service', expectedSpan: 'withLLMSpan' },
  { pattern: 'sip/src/worker/worker-pool.ts', expectedSpan: 'startActiveSpan' },
  { pattern: 'apiserver/src/reconciler/reconcile-signals', expectedSpan: 'startActiveSpan' },
  { pattern: 'apiserver/src/routes/sip/phases/dispatch', expectedSpan: 'startActiveSpan' },
  { pattern: 'fitness/src/recipes/service.ts', expectedSpan: 'startActiveSpan' },
]

/** Analyze function exported for direct testing */
export function analyzeOtelSpanCoverage(content: string, filePath: string): CheckViolation[] {
  const violations: CheckViolation[] = []
  for (const boundary of INSTRUMENTED_BOUNDARIES) {
    if (filePath.includes(boundary.pattern) && !content.includes(boundary.expectedSpan)) {
      violations.push({
        line: 1,
        message: `Missing OTel span instrumentation: expected '${boundary.expectedSpan}' in boundary function`,
        suggestion: `Add span creation using ${boundary.expectedSpan}. This file is a system boundary that must be instrumented for operational observability.`,
        severity: 'error',
      })
    }
  }
  return violations
}

export const otelSpanCoverage = defineCheck({
  id: '29de1cc0-2dac-4673-81b5-2b209d6cbf92',
  slug: 'otel-span-coverage',
  tags: ['architecture'],
  description: 'Verify OTel spans are present in instrumented boundary functions',
  scope: { languages: ['typescript'], concerns: ['backend'] },
  contentFilter: 'raw',
  fileTypes: ['ts'],
  analyze: analyzeOtelSpanCoverage,
})
