/**
 * @fileoverview DataTable Pagination Check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/devtools/datatable-pagination
 * @version 1.0.0
 *
 * Detects files using DataTable without Pagination in the same file.
 * All data tables should have pagination controls for large datasets.
 */

import { defineCheck, type CheckViolation } from '@opensip-tools/core'

// =============================================================================
// DETECTION
// =============================================================================

function analyzeFile(content: string, _filePath: string): CheckViolation[] {
  const violations: CheckViolation[] = []
  const lines = content.split('\n')

  const hasDataTable = content.includes('<DataTable')
  const hasPagination = content.includes('Pagination')

  if (hasDataTable && !hasPagination) {
    // Find the first DataTable usage line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? ''
      if (line.includes('<DataTable')) {
        violations.push({
          type: 'missing-pagination',
          line: i + 1,
          message: 'DataTable without Pagination — add pagination controls for large datasets',
          severity: 'warning',
          suggestion: 'Import and add a <Pagination> component below the DataTable',
          match: line.trim().slice(0, 120),
        })
        break
      }
    }
  }

  return violations
}

// =============================================================================
// CHECK DEFINITION
// =============================================================================

export const datatablePagination = defineCheck({
  id: 'b2c3d4e5-f6a7-8901-bcde-f23456789012',
  slug: 'datatable-pagination',
  disabled: true,
  scope: { languages: ['typescript', 'tsx'], concerns: ['frontend', 'ui'] },

  confidence: 'medium',
  description:
    'Detects DataTable components without Pagination — all data tables should have pagination controls',
  longDescription: `**Purpose:** Ensures every DataTable in the DevTools app has pagination controls.

**Detects:**
- Files containing \`<DataTable\` without any \`Pagination\` component

**Why it matters:** Data tables without pagination force users to scroll through potentially hundreds of rows. Pagination improves performance and usability.

**Scope:** DevTools app pages and components, excluding tests.`,
  tags: ['quality', 'devtools', 'ui', 'ux', 'components'],
  fileTypes: ['ts', 'tsx'],

  analyze: analyzeFile,
})
