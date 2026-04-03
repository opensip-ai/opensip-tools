/**
 * @fileoverview DataTable Column Tooltips Check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/devtools/datatable-column-tooltips
 * @version 1.0.0
 *
 * Detects DataTable column header properties that use plain string headers
 * instead of InfoExplainer tooltips. Column headers should provide context.
 */

import { defineCheck, type CheckViolation } from '@opensip-tools/core'

// =============================================================================
// STANDARD COLUMN HEADER ALLOWLIST
// =============================================================================

/**
 * Column headers that are universally self-explanatory and do not benefit from
 * InfoExplainer tooltips. Matched case-insensitively against the extracted
 * header string value.
 */
const STANDARD_COLUMN_HEADERS = new Set([
  // Standard identifiers
  'id',
  'slug',
  'key',
  'name',
  'title',
  'label',
  'agent',
  'session',
  'check',
  'ticket',
  'file',
  // Standard status
  'status',
  'state',
  'type',
  'category',
  'health',
  'severity',
  'priority',
  'required',
  // Standard metadata
  'created',
  'updated',
  'date',
  'time',
  'timestamp',
  'preview',
  'provider',
  'model',
  'source',
  'version',
  // Standard actions
  'actions',
  'operations',
  'controls',
  // Standard counts
  'count',
  'total',
  'items',
  'tickets',
  'findings',
  'values',
  // Standard descriptions
  'description',
  'notes',
  'details',
  // Standard table terms
  'match',
  'result',
  'value',
  'applies to',
])

/**
 * Returns true when the header text is a standard/self-explanatory label that
 * does not need an InfoExplainer tooltip. The match is case-insensitive and
 * also checks whether the header *contains* a standard term as a word boundary
 * (e.g. "Ticket ID", "Check ID", "Provider / Model" all match).
 */
function isStandardHeader(headerText: string): boolean {
  const normalized = headerText.trim().toLowerCase()

  // Exact match
  if (STANDARD_COLUMN_HEADERS.has(normalized)) return true

  // Check if any standard header appears as a whole word inside the text
  // This covers compound headers like "Ticket ID", "Created At", "Check ID", etc.
  for (const standard of STANDARD_COLUMN_HEADERS) {
    const pattern = new RegExp(`\\b${standard}\\b`, 'i')
    if (pattern.test(normalized)) return true
  }

  return false
}

// =============================================================================
// DETECTION
// =============================================================================

function analyzeFile(content: string, _filePath: string): CheckViolation[] {
  const violations: CheckViolation[] = []
  const lines = content.split('\n')

  // Only check files that use DataTable
  if (!content.includes('<DataTable') && !content.includes('ColumnDefinition')) {
    return violations
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()

    // Skip comments
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue

    // Detect header: "string" or header: 'string' patterns in column definitions
    const headerMatch = /header:\s*["']([A-Za-z][^"']*?)["']/.exec(line)
    if (headerMatch) {
      const headerText = headerMatch[1] ?? ''

      // Skip standard/self-explanatory column headers
      if (isStandardHeader(headerText)) continue

      violations.push({
        type: 'plain-column-header',
        line: i + 1,
        message:
          'DataTable column uses plain string header — use InfoExplainer for contextual tooltips',
        severity: 'warning',
        suggestion:
          'Replace string header with <InfoExplainer label="..." title="..." trigger="hover">',
        match: trimmed.slice(0, 120),
      })
    }
  }

  return violations
}

// =============================================================================
// CHECK DEFINITION
// =============================================================================

export const datatableColumnTooltips = defineCheck({
  id: 'c3d4e5f6-a7b8-9012-cdef-345678901234',
  slug: 'datatable-column-tooltips',
  disabled: true,
  scope: { languages: ['typescript', 'tsx'], concerns: ['frontend', 'ui'] },
  contentFilter: 'code-only',

  confidence: 'medium',
  description:
    'Detects DataTable columns with plain string headers — use InfoExplainer for contextual tooltips',
  longDescription: `**Purpose:** Ensures DataTable column headers use InfoExplainer tooltips instead of plain strings.

**Detects:**
- Column definitions with \`header: "string"\` or \`header: 'string'\` patterns in files using DataTable

**Why it matters:** Plain string column headers provide no context about what the data means. InfoExplainer tooltips give users on-demand explanations without cluttering the UI.

**Scope:** DevTools app files containing DataTable components, excluding tests.`,
  tags: ['quality', 'devtools', 'ui', 'ux', 'accessibility'],
  fileTypes: ['ts', 'tsx'],

  analyze: analyzeFile,
})
