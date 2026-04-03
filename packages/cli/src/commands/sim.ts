/**
 * sim command — run simulation scenarios
 */

import type { CliArgs } from '../types.js';
import type { ExperimentalResult } from '../types.js';

// ---------------------------------------------------------------------------
// executeSim
// ---------------------------------------------------------------------------

export function executeSim(args: CliArgs): ExperimentalResult {
  return {
    type: 'experimental',
    tool: 'sim',
    cwd: args.cwd,
  };
}
