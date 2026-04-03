/**
 * @fileoverview Enforce use of tokenStorage service abstraction
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/security/token-storage-abstraction
 * @version 2.1.0
 */

import { logger } from '@opensip-tools/core/logger'

import { defineCheck, type CheckViolation } from '@opensip-tools/core'
import { isCommentLine } from '../../utils/index.js'

// Patterns indicating direct storage usage
const DIRECT_STORAGE_PATTERNS = [
  // localStorage direct access
  {
    regex: /localStorage\.(getItem|setItem|removeItem|clear)/g,
    message: 'Direct localStorage usage detected - use tokenStorage service instead',
    suggestion:
      'Use a storage abstraction layer for consistent token handling instead of direct localStorage access.',
    severity: 'error' as const,
    type: 'direct-localstorage',
  },
  // sessionStorage direct access
  {
    regex: /sessionStorage\.(getItem|setItem|removeItem|clear)/g,
    message: 'Direct sessionStorage usage detected - use tokenStorage service instead',
    suggestion:
      'Use a storage abstraction layer for consistent token handling instead of direct sessionStorage access.',
    severity: 'error' as const,
    type: 'direct-sessionstorage',
  },
  // expo-secure-store direct import
  {
    regex: /from\s+['"]expo-secure-store['"]/g,
    message: 'Direct expo-secure-store import detected - use tokenStorage service instead',
    suggestion:
      'Import from a storage abstraction layer instead of expo-secure-store directly. This provides cross-platform compatibility.',
    severity: 'error' as const,
    type: 'direct-securestore-import',
  },
  // SecureStore direct usage
  {
    regex: /SecureStore\.(getItemAsync|setItemAsync|deleteItemAsync)/g,
    message: 'Direct SecureStore usage detected - use tokenStorage service instead',
    suggestion:
      'Use a storage abstraction layer that wraps SecureStore with additional security features instead of direct SecureStore calls.',
    severity: 'error' as const,
    type: 'direct-securestore',
  },
  // AsyncStorage direct import (React Native)
  {
    regex: /from\s+['"]@react-native-async-storage\/async-storage['"]/g,
    message: 'Direct AsyncStorage import detected - use tokenStorage service instead',
    suggestion:
      'AsyncStorage is not secure for tokens. Use a storage abstraction layer that uses SecureStore on native instead of direct AsyncStorage access.',
    severity: 'error' as const,
    type: 'direct-asyncstorage-import',
  },
]

// Paths to exclude from checking (the storage abstraction implementations)
const TOKEN_IMPL_PATTERNS = [
  '/tokenStorage',
  '/services/tokenStorage',
  '/storage/token',
  '/preferencesStorage',
  '/storage/preferences',
]

/**
 * Find direct storage pattern match in a line
 * @returns The pattern and match, or null if no match
 */
function findStoragePattern(
  line: string,
): { pattern: (typeof DIRECT_STORAGE_PATTERNS)[0]; match: RegExpExecArray } | null {
  logger.debug({
    evt: 'fitness.checks.token_storage.find_storage_pattern',
    msg: 'Finding direct storage pattern match in line',
  })
  for (const pattern of DIRECT_STORAGE_PATTERNS) {
    pattern.regex.lastIndex = 0
    const match = pattern.regex.exec(line)
    if (match) {
      return { pattern, match }
    }
  }
  return null
}

/**
 * Check: security/token-storage-abstraction
 *
 * Enforces that frontend components use the tokenStorage service abstraction
 * instead of directly calling localStorage, SecureStore, or AsyncStorage.
 */
export const tokenStorageAbstraction = defineCheck({
  id: 'bdc96456-51b5-4091-bac4-fd474c06e598',
  slug: 'token-storage-abstraction',
  disabled: true,
  scope: { languages: ['typescript'], concerns: ['backend', 'server'] },
  contentFilter: 'code-only',

  confidence: 'medium',
  description: 'Enforce use of tokenStorage service instead of direct storage APIs',
  longDescription: `**Purpose:** Enforces that frontend code uses the \`tokenStorage\` service abstraction instead of directly calling browser/native storage APIs for token management.

**Detects:**
- \`localStorage.getItem/setItem/removeItem/clear\` direct calls
- \`sessionStorage.getItem/setItem/removeItem/clear\` direct calls
- \`from 'expo-secure-store'\` direct imports
- \`SecureStore.getItemAsync/setItemAsync/deleteItemAsync\` direct calls
- \`from '@react-native-async-storage/async-storage'\` direct imports

**Why it matters:** Direct storage API usage bypasses cross-platform compatibility, encryption, and token lifecycle management provided by the tokenStorage abstraction. AsyncStorage in particular is not secure for tokens.

**Scope:** Codebase-specific convention. Analyzes each file individually. Excludes the tokenStorage implementation files themselves.`,
  tags: ['security', 'tokens', 'storage', 'abstraction'],
  fileTypes: ['ts', 'tsx'],

  analyze(content: string, filePath: string): CheckViolation[] {
    logger.debug({
      evt: 'fitness.checks.token_storage.analyze',
      msg: 'Analyzing file for direct storage API usage',
    })
    // Skip excluded paths
    if (TOKEN_IMPL_PATTERNS.some((p) => filePath.includes(p))) {
      return []
    }

    const violations: CheckViolation[] = []
    const lines = content.split('\n')

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum] ?? ''

      // Skip comments and check for storage patterns in non-comment lines
      if (!isCommentLine(line)) {
        const found = findStoragePattern(line)
        if (found) {
          const { pattern, match } = found
          violations.push({
            line: lineNum + 1,
            column: match.index,
            message: pattern.message,
            severity: pattern.severity,
            suggestion: pattern.suggestion,
            match: match[0],
            type: pattern.type,
            filePath,
          })
        }
      }
    }

    return violations
  },
})
