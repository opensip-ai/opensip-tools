/**
 * @fileoverview Simulation Framework
 *
 * Two execution models:
 * 1. **Declarative** (`defineScenario`) — Config-driven scenario definition with auto-registration,
 *    built-in validation, and standard execution. Use this for most scenarios.
 * 2. **Imperative** (`createScenario`/`createStandardExecutor`) — Low-level API for custom
 *    execution logic, manual lifecycle control, and framework-level integration.
 *
 * Both models produce runnable scenario objects that can be executed via `run(abortSignal)`.
 */

// =============================================================================
// TYPES (from types/)
// =============================================================================

export type {
  // Assertion types
  AssertionOperator,
  ScenarioAssertion,
  FailedAssertion,

  // Persona types
  PersonaConfig,

  // Executor types
  ScenarioExecutionContext,
  ScenarioLogger,
  ScenarioExecutorResult,
  CustomExecuteFn,
  ActionExecutorFn,

  // Config types
  ScenarioExecutionOptions,
  ScenarioConfig,

  // Runnable scenario
  RunnableScenario,
  ScenarioRegistryEntry,

  // Re-exports from base-types
  PersonaType,
  ScenarioType,
  ChaosConfig,
  SimulationMetrics,
} from '../types/framework-types.js'

// =============================================================================
// ASSERTIONS
// =============================================================================

export {
  ASSERTIONS,
  type AssertionFactory,
  evaluateAssertion,
  evaluateOperator,
  getOperatorDescription,
} from './assertions.js'

// =============================================================================
// PERSONAS
// =============================================================================

export {
  persona,
  type PersonaOptions,
  PERSONAS,
  type PersonaPresets,
  getTotalPersonaCount,
  getEstimatedRps,
  getPersonaTypes,
} from './personas.js'

// =============================================================================
// RESULT BUILDER
// =============================================================================

export { ScenarioResultBuilder, createEmptyMetrics, mergeMetrics } from './result-builder.js'

// =============================================================================
// REGISTRY
// =============================================================================

export { GenericRegistry, type Registerable } from './generic-registry.js'

// =============================================================================
// DEFINE SCENARIO
// =============================================================================

export {
  defineScenario,
  defineScenarioWithoutRegistration,
  getRegisteredScenarios,
  getScenario,
  getScenariosByTag,
  clearScenarioRegistry,
  validateScenarioConfig,
  type ValidationError,
} from './define-scenario.js'

// =============================================================================
// VALIDATION
// =============================================================================

export {
  type ScenarioValidationError,
  type ScenarioValidationResult,
  validateScenario,
  validateScenarios,
  formatScenarioValidationResult,
} from './validation/scenario-validator.js'

// =============================================================================
// EXECUTION ENGINE
// =============================================================================

export {
  // Error class
  ScenarioAbortedError,

  // Types
  type ScenarioMetadata,
  type ExecutorScenarioConfig,
  type ExecutorContext,
  type ExecutorLogger,
  type ExecutorResult,
  type ScenarioExecutor,
  type CreateScenarioOptions,
  type ExecutorRunnableScenario,
  type SimulationLoopOptions,
  type SimulationLoopResult,
  type StandardExecutorConfig,
  type EmitSignalInput,

  // Factory functions
  createScenario,
  createStandardExecutor,

  // Utility functions
  scenarioAborted,
  validateAssertions,
  getMetricValue,
  updateLatencyMetrics,
  sleepWithAbort,
  runSimulationLoop,
  createExecutorResult,
  emitSimulationSignal,
} from './execution/execution-engine.js'

export {
  type SimulationActionResult,
  type ChaosResult,
  type SimulationLoopContext,
  applyChaos,
} from './execution/action-handlers.js'

export { LatencyTracker } from './execution/latency-tracker.js'

// =============================================================================
// BASE TYPES (from types/)
// =============================================================================

export type {
  PersonaBehavior,
  Persona,
  PersonaAttributes,
  ActionProbabilities,
  SimulationScenario,
  ChaosType,
  ChaosInjection,
  ChaosTypeConfig,
  LatencyChaosConfig,
  ErrorChaosConfig,
  TimeoutChaosConfig,
  RateLimitChaosConfig,
  ConnectionDropChaosConfig,
  DataCorruptionChaosConfig,
  ExecutionMode,
  SimulationRunStatus,
  SimulationRun,
  ListRunsOptions,
  ISimulationService,
} from '../types/base-types.js'
