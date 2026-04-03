/**
 * history command — show run history
 */

import { loadSessions } from '../persistence/store.js';
import type { HistoryResult } from '../types.js';

// ---------------------------------------------------------------------------
// showHistory
// ---------------------------------------------------------------------------

export function showHistory(): HistoryResult {
  const sessions = loadSessions();
  return {
    type: 'history',
    sessions,
  };
}
