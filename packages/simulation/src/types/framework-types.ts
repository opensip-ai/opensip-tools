/**
 * @fileoverview Type definitions for the Simulation Framework
 *
 * ScenarioConfig is the primary interface for scenario authors.
 * All optional fields have sensible defaults. Readonly types ensure immutability.
 */

import type { Signal } from '@opensip-tools/core'

import type {
  AssertionOperator,
  ScenarioType,
  ChaosConfig,
  SimulationMetrics,
  PersonaType,
  ScenarioAssertion as MutableScenarioAssertion,
} from './base-types.js'

// =============================================================================
// ASSERTION TYPES
// =============================================================================

export type { AssertionOperator }

/**
 * A scenario assertion definition (readonly variant for framework use).
 */
export type ScenarioAssertion = Readonly<MutableScenarioAssertion>

/**
 * A failed assertion with actual value.
 */
export interface FailedAssertion extends ScenarioAssertion {
  readonly actual: number
}

// =============================================================================
// PERSONA TYPES
// =============================================================================

/**
 * Configuration for a persona in a scenario (readonly variant for framework use).
 */
export interface PersonaConfig {
  readonly personaId: string
  readonly count: number
  readonly spawnRate: number
  readonly actions: readonly string[]
}

// =============================================================================
// EXECUTOR TYPES
// =============================================================================

/**
 * Context passed to scenario executors.
 */
export interface ScenarioExecutionContext {
  readonly scenarioId: string
  readonly correlationId: string
  readonly abortSignal: AbortSignal
  readonly logger: ScenarioLogger
}

/**
 * Logger interface for scenarios.
 */
export interface ScenarioLogger {
  info(message: string, data?: Record<string, unknown>): void
  warn(message: string, data?: Record<string, unknown>): void
  error(message: string, data?: Record<string, unknown>): void
  debug(message: string, data?: Record<string, unknown>): void
}

/**
 * Result of executing a scenario.
 */
export interface ScenarioExecutorResult {
  readonly passed: boolean
  readonly metrics: SimulationMetrics
  readonly assertions: {
    readonly passed: readonly ScenarioAssertion[]
    readonly failed: readonly FailedAssertion[]
  }
  readonly signals: readonly Signal[]
}

/**
 * Custom execute function signature.
 */
export type CustomExecuteFn = (context: ScenarioExecutionContext) => Promise<ScenarioExecutorResult>

/**
 * Action executor function signature.
 */
export type ActionExecutorFn = (action: string, context: ScenarioExecutionContext) => Promise<void>

// =============================================================================
// SCENARIO CONFIG
// =============================================================================

/**
 * Options for scenario execution.
 */
export interface ScenarioExecutionOptions {
  readonly persistReports?: boolean
  readonly persistLogs?: boolean
}

/**
 * Full scenario configuration.
 * This is what scenario authors provide to defineScenario().
 */
export interface ScenarioConfig {
  // === Required Metadata ===
  readonly id: string
  readonly name: string
  readonly description: string
  readonly type: ScenarioType
  readonly tags: readonly string[]

  // === Simulation Configuration ===
  readonly personas: readonly PersonaConfig[]
  readonly duration: number
  readonly rampUp?: number
  readonly targetRps?: number

  // === Assertions ===
  readonly assertions: readonly ScenarioAssertion[]

  // === Optional Customization ===
  readonly execute?: CustomExecuteFn
  readonly actionExecutor?: ActionExecutorFn
  readonly chaosConfig?: ChaosConfig

  // === Execution Options ===
  readonly options?: ScenarioExecutionOptions
}

// =============================================================================
// RUNNABLE SCENARIO
// =============================================================================

/**
 * A validated, runnable scenario.
 * Created by defineScenario() after validation.
 */
export interface RunnableScenario {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly type: ScenarioType
  readonly tags: readonly string[]

  /**
   * Run the scenario with the given abort signal.
   */
  run(abortSignal: AbortSignal): Promise<ScenarioExecutorResult>

  /**
   * Get the raw configuration.
   */
  getConfig(): Readonly<ScenarioConfig>
}

// =============================================================================
// REGISTRY TYPES
// =============================================================================

/**
 * Scenario registry entry.
 */
export interface ScenarioRegistryEntry {
  readonly id: string
  readonly name: string
  readonly scenario: RunnableScenario
  readonly tags: readonly string[]
}

// =============================================================================
// RE-EXPORTS
// =============================================================================

export type { PersonaType, ScenarioType, ChaosConfig, SimulationMetrics }
