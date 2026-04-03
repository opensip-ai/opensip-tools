/**
 * @opensip-tools/checks-builtin — Default fitness checks for opensip-tools
 *
 * This package follows the plugin contract: exports `checks` array and `metadata`.
 */

import { isCheck } from '@opensip-tools/core'
import type { Check } from '@opensip-tools/core'
import * as allChecks from './checks/index.js'

// Collect all Check objects from the barrel exports, deduplicated by ID
function collectChecks(obj: Record<string, unknown>, seen = new Set<string>()): Check[] {
  const result: Check[] = []
  for (const value of Object.values(obj)) {
    if (isCheck(value)) {
      if (!seen.has(value.config.id)) {
        seen.add(value.config.id)
        result.push(value)
      }
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result.push(...collectChecks(value as Record<string, unknown>, seen))
    }
  }
  return result
}

/** All built-in checks, exported as a flat array per plugin contract */
export const checks: readonly Check[] = collectChecks(allChecks as unknown as Record<string, unknown>)

/** Plugin metadata */
export const metadata = {
  name: '@opensip-tools/checks-builtin',
  version: '0.0.1',
  description: 'Default fitness checks shipped with opensip-tools',
}

// Display names for checks
export { getCheckDisplayName, getCheckIcon, CHECK_DISPLAY } from './display/index.js'
export type { CheckDisplayEntry } from './display/types.js'
