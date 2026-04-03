/**
 * @fileoverview Service-layer type definitions for fitness recipe execution
 *
 * Defines the configuration, session state, and callback types
 * used by FitnessRecipeService and its execution engines.
 */

import type { Signal } from '../types/signal.js'

import type { DirectiveEntry } from '../framework/directive-inventory.js'
import type { CheckMemoryProfile } from '../framework/memory-profiler.js'

import type {
  FitnessRecipe,
  FitnessRecipeResult,
  RecipeCheckResult,
  ReconciliationCounts,
  TicketStats,
  IgnoresByType,
} from './types.js'

/** Re-exported ticket statistics type */
export type { TicketStats }

// =============================================================================
// CHECK SUMMARY (used for callbacks)
// =============================================================================

/** Summary of a single check execution for callback reporting */
export interface CheckSummary {
  readonly checkId: string
  readonly checkSlug: string
  readonly passed: boolean
  readonly errors: number
  readonly warnings: number
  readonly durationMs: number
  readonly filesScanned: number
  readonly ignoredCount: number
  readonly memoryProfile: CheckMemoryProfile
  readonly timedOut?: boolean
  readonly errorMessage?: string
}

// =============================================================================
// TICKET TYPES
// =============================================================================

/** Metadata passed to the ticket creation callback */
export interface TicketCreateMetadata {
  readonly deduplicationKey: string
}

// =============================================================================
// SERVICE CALLBACKS
// =============================================================================

/** Callbacks invoked during recipe execution for progress, errors, and reconciliation */
export interface FitnessRecipeServiceCallbacks {
  onCheckStart?: (checkSlug: string, index: number, total: number) => void
  onCheckComplete?: (checkSlug: string, summary: CheckSummary, index: number, total: number) => void
  onError?: (checkSlug: string, error: Error) => void
  onTicketCreate?: (ticketId: string, checkId: string, metadata: TicketCreateMetadata) => void
  onMemoryWarning?: (checkId: string, profile: CheckMemoryProfile) => void
  onComplete?: (result: FitnessRecipeResult) => void
  /** Called after each check to reconcile signals against the ticket database. */
  onReconcile?: (checkId: string, checkSlug: string, signals: Signal[]) => void | Promise<void>
  /** Called before execution with all registered checks for catalog sync. */
  onCatalogSync?: (entries: Array<{ id: string; slug: string; tags: readonly string[]; description: string }>) => void
}

// =============================================================================
// SERVICE CONFIGURATION
// =============================================================================

/** Configuration for the fitness recipe service */
export interface FitnessRecipeServiceConfig {
  cwd?: string
  prewarmCache?: boolean
  prewarmPatterns?: string[]
  callbacks?: FitnessRecipeServiceCallbacks
  /** Per-check pre-resolved file paths from target overrides. Map of check slug → absolute file paths. */
  checkTargetFiles?: ReadonlyMap<string, readonly string[]>
  /** Optional check registry (defaults to defaultRegistry). */
  checkRegistry?: import('../framework/registry.js').CheckRegistry
  /** Optional recipe registry (defaults to defaultRecipeRegistry). */
  recipeRegistry?: import('./registry.js').FitnessRecipeRegistry
  /** Check slugs disabled via opensip.config.yml — these checks are skipped unless force-included by a recipe. */
  disabledChecks?: readonly string[]
  /** When true, carry violation details on RecipeCheckResult. */
  includeViolations?: boolean
}

// =============================================================================
// SESSION STATE
// =============================================================================

/** Mutable session state tracking progress during a recipe execution */
export interface FitnessRecipeSession {
  readonly sessionId: string
  readonly recipe: FitnessRecipe
  readonly startedAt: Date
  status: 'running' | 'completed' | 'failed'
  totalChecks: number
  completedChecks: number
  passedChecks: number
  failedChecks: number
  totalErrors: number
  totalWarnings: number
  totalIgnored: number
  ignoresByTag: Map<string, number>
  ticketStats: TicketStats
  checkResults: RecipeCheckResult[]
  ignoreCounts?: IgnoresByType | undefined
  reconciliationCounts: Map<string, ReconciliationCounts>
  directives: DirectiveEntry[]
}
