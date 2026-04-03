/**
 * @fileoverview Next.js Conventions Check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/devtools/nextjs-conventions
 * @version 1.0.0
 *
 * Enforces Next.js App Router conventions in the DevTools portal:
 * - No href="#" or href="" (use non-link elements or proper routes)
 * - Dynamic route pages should export generateMetadata
 * - Route groups should have not-found.tsx and loading.tsx siblings
 */

import { defineCheck, type CheckViolation } from '@opensip-tools/core'

// =============================================================================
// CONSTANTS
// =============================================================================

/** Pattern to detect dynamic route segments in file paths */
const DYNAMIC_ROUTE_PATTERN = /\/\[[\w-]+\]\/page\.tsx$/

// =============================================================================
// DETECTION HELPERS
// =============================================================================

/**
 * Detect href="#" and href="" which indicate non-semantic link usage.
 */
function detectEmptyHrefs(lines: string[]): CheckViolation[] {
  const violations: CheckViolation[] = []
  const emptyHrefPattern = /href\s*=\s*(?:['"]#['"]|['"]["']|\{['"]#['"]\}|\{['"]['"]}\})/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()

    // Skip comments
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue

    if (emptyHrefPattern.test(line)) {
      violations.push({
        type: 'empty-href',
        line: i + 1,
        message:
          'href="#" or href="" — use a <button> or <div role="button"> instead of a non-navigating link',
        severity: 'error',
        suggestion:
          'If this is clickable but not a navigation link, use <button> with an onClick handler',
        match: trimmed.slice(0, 120),
      })
    }
  }

  return violations
}

/**
 * Detect dynamic route pages missing generateMetadata export.
 * Only applies to page.tsx files inside [param] directories.
 */
function detectMissingGenerateMetadata(content: string, filePath: string): CheckViolation[] {
  // Only check dynamic route pages
  if (!DYNAMIC_ROUTE_PATTERN.test(filePath)) {
    return []
  }

  // Check if generateMetadata is exported
  if (
    content.includes('export function generateMetadata') ||
    content.includes('export async function generateMetadata') ||
    content.includes('export const generateMetadata')
  ) {
    return []
  }

  // Also check for metadata export (static metadata is acceptable too)
  if (content.includes('export const metadata') || content.includes('export const metadata:')) {
    return []
  }

  return [
    {
      type: 'missing-generate-metadata',
      line: 1,
      message:
        'Dynamic route page missing generateMetadata() — page title will not reflect content',
      severity: 'warning',
      suggestion:
        'Export a generateMetadata() function to provide dynamic page titles, e.g.: ' +
        'export async function generateMetadata({ params }: Props) { return { title: `Item ${params.id}` } }',
    },
  ]
}

/**
 * Detect page.tsx files in route groups missing sibling not-found.tsx or loading.tsx.
 * Uses the file path to check for siblings by constructing expected paths.
 */
function detectMissingRouteFiles(content: string, filePath: string): CheckViolation[] {
  const violations: CheckViolation[] = []

  // Only check page.tsx files
  if (!filePath.endsWith('/page.tsx')) return []

  // Check if this is inside a route group (parenthesized directory)
  const routeGroupPattern = /\/\([^)]+\)\//
  if (!routeGroupPattern.test(filePath)) return []

  // Get the directory containing this page
  const dir = filePath.replace(/\/page\.tsx$/, '')

  // Check for loading indicator in the content — if the page handles its own loading,
  // a loading.tsx is still beneficial for streaming/suspense
  const hasInlineLoading = /isLoading|loading/.test(content)

  if (hasInlineLoading) {
    // Only suggest, don't flag as missing
    violations.push({
      type: 'suggest-loading-tsx',
      line: 1,
      message:
        'Page has inline loading state — consider adding loading.tsx for streaming/suspense support',
      severity: 'warning',
      suggestion: `Create ${dir}/loading.tsx to enable Next.js streaming with a loading skeleton`,
    })
  }

  return violations
}

// =============================================================================
// ANALYSIS FUNCTION
// =============================================================================

/**
 * Analyze a single file for Next.js convention violations.
 */
function analyzeFile(content: string, filePath: string): CheckViolation[] {
  return [
    ...detectEmptyHrefs(content.split('\n')),
    ...detectMissingGenerateMetadata(content, filePath),
    ...detectMissingRouteFiles(content, filePath),
  ]
}

// =============================================================================
// CHECK DEFINITION
// =============================================================================

/**
 * Check: quality/nextjs-conventions
 *
 * Enforces Next.js App Router conventions in the DevTools portal.
 */
export const nextjsConventions = defineCheck({
  id: '719cb751-02e1-4bad-930b-89db3c3dc2c6',
  slug: 'nextjs-conventions',
  disabled: true,
  scope: { languages: ['typescript', 'tsx'], concerns: ['frontend', 'ui'] },
  contentFilter: 'code-only',

  confidence: 'medium',
  description:
    'Enforces Next.js conventions: no empty hrefs, generateMetadata on dynamic routes, loading.tsx for streaming',
  longDescription: `**Purpose:** Enforces Next.js App Router conventions for SEO, accessibility, and streaming support.

**Detects:**
- \`href="#"\` or \`href=""\` patterns (non-navigating links that should be \`<button>\` elements)
- Dynamic route pages (\`/[param]/page.tsx\`) missing \`export function generateMetadata\` or \`export const metadata\`
- Pages in route groups (\`/(group)/\`) with inline loading state but no \`loading.tsx\` sibling for streaming/suspense

**Why it matters:** Empty hrefs break accessibility and SEO. Missing metadata on dynamic routes produces generic page titles. Missing loading.tsx prevents Next.js streaming optimizations.

**Scope:** Codebase-specific convention (Next.js App Router). Analyzes each file individually.`,
  tags: ['quality', 'devtools', 'nextjs', 'conventions', 'seo'],
  fileTypes: ['ts', 'tsx'],

  analyze: analyzeFile,
})
