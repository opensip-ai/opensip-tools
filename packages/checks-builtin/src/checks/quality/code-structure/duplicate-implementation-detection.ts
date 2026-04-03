// @fitness-ignore-file toctou-race-condition -- TOCTOU acceptable in this non-concurrent context
// @fitness-ignore-file no-raw-regex-on-code -- fitness check: regex patterns analyze trusted codebase content, not user input
/**
 * @fileoverview Duplicate Implementation Detection check
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/quality/code-structure/duplicate-implementation-detection
 * @version 2.0.0
 *
 * Detects duplicate function/class implementations across the codebase.
 * Identifies opportunities for code consolidation and DRY violations.
 */

import { createHash } from 'node:crypto'
import { basename } from 'node:path'

import * as ts from 'typescript'

import { defineCheck, type CheckViolation, type FileAccessor } from '@opensip-tools/core'
import { getSharedSourceFile } from '@opensip-tools/core/framework/parse-cache.js'

/**
 * Method names that are common patterns legitimately duplicated across domains.
 * These are structural patterns where each implementation has domain-specific logic
 * (different error codes, cleanup operations, etc.) that shouldn't be consolidated.
 */
const ALLOWED_PATTERN_NAMES = new Set([
  // Lifecycle management - different cleanup logic per service
  'dispose',
  'shutdown',
  'close',
  'destroy',
  'cleanup',
  // Guard methods - same pattern but different error codes per domain
  'ensureNotDisposed',
  'ensureNotDestroyed',
  'ensureInitialized',
  'ensureConnected',
  'ensureAuthenticated',
  // Thin wrappers with domain-specific prefixes
  'generateCorrelationId',
  // Error wrapping utilities - domain-specific error handling
  'wrapError',
  'handleError',
  'logError',
  // Common interface implementations with trivial bodies
  'getStrategyName',
  'supportsTimestamp',
  'isEnabled',
  'isDisposed',
  'isInitialized',
  // Infrastructure patterns - health checks, command execution
  'healthCheck',
  'checkHealth',
  'execute',
  'run',
  'start',
  'stop',
  // Monitoring and stats - domain-specific implementations
  'getStats',
  'registerMetrics',
  // Middleware patterns - different per route/service
  'middleware',
  // DI patterns
  'getContainer',
  // ID generation patterns - different strategies per ID type
  'decodeTimestamp',
  'generateShort',
  // Payment processor patterns - provider-specific implementations
  'processSubscriptionPayment',
  'processWebhookEvent',
  // Token patterns - provider-specific implementations
  'decodeToken',
  // Validation patterns - domain-specific validation logic
  'validateTemplate',
  // Repository patterns - often interface implementations with same structure
  'addWishlistItem',
  'getUserTrades',
  'getAllVerifications',
  // Query patterns - different per data source
  'query',
  // Configuration patterns - different per provider
  'setProvider',
  'getKey',
  // File utility patterns - trivial implementations with slight variations
  'getFileExtension',
  'isValidUrl',
  // Adapter patterns - provider-specific implementations
  'buildQueryResult',
  'updateCommunityStats',
  'getForumsByCommunity',
  'decryptDataKey',
  'deriveKey',
  'getUserSocialStats',
  // Caching patterns - different strategies per service
  'getFromCacheAsync',
  'getCachePolicy',
  // Recommendation patterns - different algorithms per context
  'getInteractionWeight',
  // Community patterns - different per adapter
  'getCommunity',
  // Pricing patterns - different calculation logic
  'getDaysInCycle',
  // Factory patterns - different per module
  'createRecoveryOrchestrator',
  // Batch generation patterns
  'generateBatchId',
  // Rate limiting patterns - different per implementation
  'isAllowed',
  // Preferences/profile patterns
  'updatePreferences',
  // Vertical-specific patterns - legitimately duplicated across watches/cards
  'buildSearchMappings',
  'calculateFees',
  'getRequiredDocuments',
  'configureCompositionRoot',
  'resetCompositionRoot',
  'initializeCardSwap',
  // I18n patterns - domain-specific checks
  'isCurrencySupported',
  'isLocaleSupported',
  // Validation helper patterns
  'validationFailed',
  'toServiceResult',
  // Deletion patterns - different per entity
  'deleteRelation',
  // MFA/auth patterns
  'generateChallenge',
  'validateCode',
  'performAdditionalValidation',
  // Logging patterns
  'logTradeEvent',
  // Masking patterns
  'maskEmail',
  // Hashing patterns
  'hashCode',
  // Amount parsing patterns
  'parseAmount',
  // Sanitization patterns
  'handleSanitizationError',
  // Service/repository patterns
  'getTicketNoteCount',
  // Subscription validation patterns
  'validateSubscriptionRequest',
  'validateRefundRequest',
  // Error builder patterns
  'withCorrelationId',
  // Model version patterns
  'addModelVersion',
  'setCurrentVersion',
  // Repository CRUD patterns - common across adapters
  'deleteForum',
  'searchForums',
  'removeWishlistItem',
  // Validation patterns - domain-specific naming
  'ValidateRegistryRequest',
  'validateRatingRequest',
  // Crypto adapter operations
  'rotateKey',
  'listKeys',
  // Health check interface implementations
  'check',
  // Policy getter patterns
  'getObservabilityPolicy',
  // Vertical-specific registration
  'registerCardSwapAuthenticationProviders',
  // DevTools service methods
  'deleteRelationBetween',
  // Preferences/profile methods
  'updateAllPreferences',
  // Middleware patterns - different contexts
  'correlationMiddleware',
  // AI model repository operations
  'deleteModel',
  // Forum/thread CRUD operations
  'deleteThread',
  'getThreadsByForum',
  // Wishlist operations
  'updateWishlistItemPriority',
  // Validation patterns
  'performDefaultValidation',
  // Preferences reset
  'resetPreferences',
  // Crypto key operations
  'generateKey',
  'getKeyVersions',
  // Policy getter patterns
  'getRateLimitPolicy',
  // Forum/thread operations
  'getThreadsByAuthor',
  'deletePost',
  // Crypto key storage
  'storeKeyPair',
  // Policy getter patterns
  'getRetryPolicy',
  // Plugin validation patterns
  'checkPluginCompatibility',
  // Forum/thread search and stats
  'searchThreads',
  'updateForumStats',
  // Crypto key pair operations
  'deleteKeyPair',
  // Policy getter patterns
  'getCircuitBreakerPolicy',
  // Config validation patterns
  'validateDistributedConfig',
  // Forum posts and stats operations
  'getPostsByThread',
  'updateThreadStats',
  // Crypto key ID operations
  'listKeyIds',
  // Generic validation interface
  'validate',
  // Forum/social post operations
  'getPostsByAuthor',
  'updatePostStats',
  // Context validation
  'validateContext',
  // Search patterns
  'searchPosts',
  // Social connection patterns
  'deleteConnection',
  // Metadata validation
  'validateMetadata',
  // Social/forum reply patterns
  'getPostReplies',
  'removeLike',
  'removeShare',
  'deleteComment',
  'updateUserSocialStats',
  // Adapter patterns - provider-specific lazy client initialization
  'getClient',
  // Type guard patterns - trivial implementations co-located with consumers
  'isPlainObject',
  // Config-driven path resolution - co-located with consumers for encapsulation
  'getDefaultLogDir',
  // Initial state factories - domain-specific default values
  'createInitialChildStats',
])

/**
 * Minimum number of lines a file must have to be analyzed.
 * Trivial files (< 50 lines) rarely contain meaningful duplication worth flagging.
 */
const MIN_FILE_LINES = 50

/**
 * Minimum normalized body length for a function to be considered non-trivial.
 * Increased from 50 to 80 to reduce noise from small utility functions that
 * coincidentally produce the same normalized hash.
 */
const MIN_BODY_LENGTH = 80

/**
 * Normalize code for comparison (remove whitespace, variable names)
 */
function normalizeCode(code: string): string {
  return code
    .replace(/\s+/g, ' ') // Normalize whitespace
    // eslint-disable-next-line sonarjs/slow-regex -- .*$ anchored to line end; linear scan
    .replace(/\/\/.*$/gm, '') // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
    .replace(/['"`][^'"`]*['"`]/g, 'STR') // Normalize strings
    .replace(/\b\d+\b/g, 'NUM') // Normalize numbers
    .trim()
}

/**
 * Check if a file is a barrel re-export file (primarily `export { ... } from` statements).
 * These files just re-export symbols and should not be analyzed for duplication.
 */
function isBarrelFile(content: string): boolean {
  const lines = content.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'))
  if (lines.length === 0) return false
  const exportLines = lines.filter((l) => /^\s*export\s/.test(l))
  return exportLines.length / lines.length > 0.7
}

function extractSignatures(
  filePath: string,
  content: string,
): Array<{ hash: string; line: number; name: string }> {
  const signatures: Array<{ hash: string; line: number; name: string }> = []

  // Skip trivial files (below minimum line threshold)
  const lineCount = content.split('\n').length
  if (lineCount < MIN_FILE_LINES) return signatures

  // Skip barrel re-export files
  if (isBarrelFile(content)) return signatures

  try {
    const sourceFile = getSharedSourceFile(filePath, content)
    if (!sourceFile) return []

    const visit = (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) && node.name && node.body) {
        const name = node.name.text

        // Skip allowed pattern names (common lifecycle/guard patterns)
        if (ALLOWED_PATTERN_NAMES.has(name)) {
          ts.forEachChild(node, visit)
          return
        }

        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart())

        // Create hash of function structure (normalized)
        const normalizedBody = normalizeCode(node.body.getText(sourceFile))
        const hash = createHash('sha256').update(normalizedBody).digest('hex')

        // Only track non-trivial functions (increased threshold to reduce noise)
        if (normalizedBody.length > MIN_BODY_LENGTH) {
          signatures.push({ hash, line: line + 1, name })
        }
      }

      if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && node.body) {
        const name = node.name.text

        // Skip allowed pattern names (common lifecycle/guard patterns)
        if (ALLOWED_PATTERN_NAMES.has(name)) {
          ts.forEachChild(node, visit)
          return
        }

        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart())

        const normalizedBody = normalizeCode(node.body.getText(sourceFile))
        const hash = createHash('sha256').update(normalizedBody).digest('hex')

        if (normalizedBody.length > MIN_BODY_LENGTH) {
          signatures.push({ hash, line: line + 1, name })
        }
      }

      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
  } catch {
    // @swallow-ok Ignore parse errors
  }

  return signatures
}

/**
 * Check: quality/duplicate-implementation-detection
 *
 * Detects duplicate function/class implementations across the codebase.
 */
export const duplicateImplementationDetection = defineCheck({
  id: '4d885b3b-d405-4296-bab7-2cc8383192b9',
  slug: 'duplicate-implementation-detection',
  scope: { languages: ['typescript'], concerns: ['backend', 'frontend', 'cli'] },

  confidence: 'high',
  description: 'Detect duplicate function/class implementations',
  longDescription: `**Purpose:** Detects duplicate function and method implementations across the codebase by comparing normalized body hashes, identifying opportunities for consolidation into shared modules.

**Detects:** Cross-file analysis using TypeScript AST to extract function bodies and SHA-256 hashing.
- Functions/methods with identical normalized bodies (whitespace, comments, strings, and numbers stripped) appearing in multiple files
- Only flags non-trivial functions (normalized body > 80 characters)
- Skips common lifecycle/infrastructure patterns listed in \`ALLOWED_PATTERN_NAMES\` (e.g., \`dispose\`, \`shutdown\`, \`healthCheck\`, \`execute\`)
- Skips test files (\`*.test.ts\`, \`__tests__/\`) -- test helpers are intentionally similar
- Skips \`packages/infrastructure/\` -- intentional per-module implementations
- Skips files smaller than 50 lines (trivial files)
- Skips barrel re-export files

**Why it matters:** Duplicate implementations violate DRY and create maintenance risk where bug fixes must be applied in multiple locations. Consolidating into shared packages reduces defect surface.

**Scope:** General best practice`,
  tags: ['quality', 'dry', 'duplication', 'code-quality'],
  fileTypes: ['ts'],

  async analyzeAll(files: FileAccessor): Promise<CheckViolation[]> {
    // Collect all function signatures
    const functionSignatures = new Map<
      string,
      Array<{ file: string; line: number; name: string }>
    >()

    // @fitness-ignore-next-line performance-anti-patterns -- false positive: keyword in comment text below, not an async call
    // @lazy-ok -- validations in subsequent loops depend on data collected from await
    for (const filePath of files.paths) {
      // Skip test files — test helpers often look similar but test different things
      if (filePath.includes('.test.') || filePath.includes('__tests__/')) continue

      // Skip infrastructure package — intentional per-module implementations
      if (filePath.includes('packages/infrastructure/')) continue

      try {
        // @fitness-ignore-next-line performance-anti-patterns -- sequential file reading to control memory; FileAccessor is lazy
        const content = await files.read(filePath)
        const signatures = extractSignatures(filePath, content)

        for (const sig of signatures) {
          const existing = functionSignatures.get(sig.hash) ?? []
          existing.push({ file: filePath, line: sig.line, name: sig.name })
          functionSignatures.set(sig.hash, existing)
        }
      } catch {
        // @swallow-ok Skip unreadable files
      }
    }

    // Build violations for duplicates
    const violations: CheckViolation[] = []

    // Filter to only locations with actual cross-file duplicates
    const crossFileDuplicates = Array.from(functionSignatures.values()).filter((locations) => {
      if (locations.length <= 1) return false
      const uniqueFiles = new Set(locations.map((l) => l.file))
      return uniqueFiles.size > 1
    })

    // @fitness-ignore-next-line performance-anti-patterns -- template literals in bounded violation loop; not a hot path
    for (const locations of crossFileDuplicates) {
      const first = locations[0]
      if (!first) {
        continue
      }
      const others = locations.slice(1)

      const duplicateFiles = others.map((o) => basename(o.file)).slice(0, 3)
      const moreCount = others.length > 3 ? ` (+${others.length - 3} more)` : ''

      violations.push({
        line: first.line,
        message: `Function '${first.name}' has ${locations.length - 1} duplicate(s) in other files`,
        severity: 'warning',
        suggestion: `Move '${first.name}' to a shared module in packages/shared/ or foundation/. Duplicates in: ${duplicateFiles.join(', ')}${moreCount}`,
        type: 'duplicate-function',
        match: first.name,
        filePath: first.file,
      })
    }

    return violations
  },
})
