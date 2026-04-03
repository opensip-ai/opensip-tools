/**
 * @fileoverview Display entries for resilience checks
 */

import type { CheckDisplayEntry } from './types.js'

/** Resilience check display entries */
export const RESILIENCE_DISPLAY = Object.freeze<Record<string, CheckDisplayEntry>>({
  'await-result-unwrap': ['\u26A1', 'Await Result Unwrap'],
  'batch-operation-limits': ['\uD83D\uDCE6', 'Batch Operation Limits'],
  'cache-ttl-validation': ['\uD83D\uDCBE', 'Cache TTL Validation'],
  'context-leakage': ['\uD83D\uDD0D', 'Context Leakage'],
  'context-mutation-check': ['\uD83D\uDD0D', 'Context Mutation Safety Check'],
  'dangerous-config-defaults': ['\u26A0\uFE0F', 'Dangerous Configuration Defaults'],
  'detached-promises': ['\uD83D\uDD17', 'Detached Promises Detection'],
  'error-handling-suite': ['\u26A0\uFE0F', 'Error Handling Suite'],
  'event-architecture': ['\uD83D\uDCE8', 'Event Architecture'],
  'event-handler-idempotency': ['\uD83D\uDCE8', 'Event Handler Idempotency'],
  'graceful-shutdown': ['\uD83D\uDED1', 'Graceful Shutdown'],
  'no-custom-cache': ['\uD83D\uDCBE', 'No Custom Cache'],
  'no-custom-rate-limiter': ['\uD83D\uDEE1\uFE0F', 'No Custom Rate Limiter'],
  'no-empty-throw': ['\u26A0\uFE0F', 'No Empty Throw'],
  'no-generic-error': ['\u26A0\uFE0F', 'No Generic Error'],
  'no-hardcoded-timeouts': ['\u23F1\uFE0F', 'No Hardcoded Timeouts'],
  'no-raw-fetch': ['\uD83C\uDF10', 'No Raw Fetch'],
  'no-unbounded-concurrency': ['\u26A1', 'No Unbounded Concurrency'],
  'rate-limiting-coverage': ['\uD83D\uDEE1\uFE0F', 'Rate Limiting Coverage'],
  'recovery-patterns': ['\uD83D\uDD04', 'Recovery Layer Usage'],
  'retry-config-validation': ['\uD83D\uDD04', 'Retry Config Validation'],
  'transaction-boundary-validation': ['\uD83D\uDCBE', 'Transaction Boundary Validation'],
  'transaction-timeout': ['\u23F1\uFE0F', 'Transaction Timeout'],
  'unbounded-memory': ['\uD83D\uDCBE', 'Unbounded Memory Detection'],
  'catch-clause-safety': ['\u26A0\uFE0F', 'Catch Clause Safety'],
  'error-code-registration': ['\u26A0\uFE0F', 'Error Code Registration'],
  'exit-code-correctness': ['\u26A0\uFE0F', 'Exit Code Correctness'],
  'no-process-exit-in-finally': ['\uD83D\uDED1', 'No Process Exit In Finally'],
  'readline-cleanup': ['\uD83E\uDDF9', 'Readline Cleanup'],
  'reentrancy-guard': ['\uD83D\uDD12', 'Reentrancy Guard'],
  'timer-lifecycle': ['\u23F1\uFE0F', 'Timer Lifecycle'],
})
