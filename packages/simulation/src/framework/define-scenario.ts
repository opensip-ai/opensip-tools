// @fitness-ignore-file null-safety -- ScenarioResultBuilder.create() returns a fluent builder; chained method calls are always safe
// @fitness-ignore-file array-validation -- array parameters validated at API boundary
/**
 * @fileoverview Main entry point for defining simulation scenarios
 *
 * Scenarios are validated at definition time.
 * All scenarios are auto-registered in the global registry.
 * Execution context is always provided to executors.
 */

import { logger } from '@opensip-tools/core'
import { GenericRegistry } from './generic-registry.js'
import { ValidationError as CoreValidationError } from '@opensip-tools/core'
import type { Signal } from '@opensip-tools/core'

import type { SimulationMetrics } from '../types/base-types.js'
import type {
  ScenarioConfig,
  RunnableScenario,
  ScenarioExecutionContext,
  ScenarioExecutorResult,
  ScenarioLogger,
} from '../types/framework-types.js'

import { ScenarioAbortedError } from './execution/execution-engine.js'
import { LatencyTracker } from './execution/latency-tracker.js'
import { getEstimatedRps } from './personas.js'
import { ScenarioResultBuilder, createEmptyMetrics } from './result-builder.js'


// =============================================================================
// GLOBAL REGISTRY
// =============================================================================

const scenarioRegistry = new GenericRegistry<RunnableScenario>('simulation.scenarios')

/**
 * Get all registered scenarios.
 */
export function getRegisteredScenarios(): Map<string, RunnableScenario> {
  const map = new Map<string, RunnableScenario>()
  for (const scenario of scenarioRegistry.getAll()) {
    map.set(scenario.id, scenario)
  }
  return map
}

/**
 * Get a scenario by ID or name.
 */
export function getScenario(idOrName: string): RunnableScenario | undefined {
  return scenarioRegistry.get(idOrName)
}

/**
 * Get scenarios by tag.
 */
export function getScenariosByTag(tag: string): RunnableScenario[] {
  return scenarioRegistry.getByTag(tag)
}

/**
 * Clear the scenario registry. Primarily for testing.
 */
export function clearScenarioRegistry(): void {
  scenarioRegistry.clear()
}

// =============================================================================
// VALIDATION
// =============================================================================

/** Validation error with field name and message */
export interface ValidationError {
  readonly field: string
  readonly message: string
}

function validateIdField(config: ScenarioConfig, errors: ValidationError[]): void {
  if (!config.id || config.id.trim() === '') {
    errors.push({ field: 'id', message: 'id is required' })
    return
  }
  if (!/^[a-z0-9-]+$/.test(config.id)) {
    errors.push({
      field: 'id',
      message: 'id must be lowercase alphanumeric with hyphens',
    })
  }
}

function validatePersona(
  persona: ScenarioConfig['personas'][number] | undefined,
  index: number,
  errors: ValidationError[],
): void {
  if (!persona) return

  if (!persona.personaId) {
    errors.push({
      field: `personas[${index}].personaId`,
      message: 'personaId is required',
    })
  }
  if (typeof persona.count !== 'number' || persona.count <= 0) {
    errors.push({
      field: `personas[${index}].count`,
      message: 'count must be a positive number',
    })
  }
}

function collectPersonaValidationErrors(config: ScenarioConfig, errors: ValidationError[]): void {
  if (config.personas.length === 0) {
    errors.push({ field: 'personas', message: 'at least one persona is required' })
    return
  }

  for (let i = 0; i < config.personas.length; i++) {
    validatePersona(config.personas[i], i, errors)
  }
}

function validateRampUp(config: ScenarioConfig, errors: ValidationError[]): void {
  if (config.rampUp === undefined) return

  if (typeof config.rampUp !== 'number' || config.rampUp < 0) {
    errors.push({ field: 'rampUp', message: 'rampUp must be a non-negative number' })
    return
  }
  if (config.rampUp > config.duration) {
    errors.push({
      field: 'rampUp',
      message: 'rampUp cannot exceed duration',
    })
  }
}

function validateDuplicates(config: ScenarioConfig, errors: ValidationError[]): void {
  if (config.id && scenarioRegistry.has(config.id)) {
    errors.push({
      field: 'id',
      message: `scenario with id '${config.id}' is already registered`,
    })
  }
  if (config.name && scenarioRegistry.has(config.name)) {
    errors.push({
      field: 'name',
      message: `scenario with name '${config.name}' is already registered`,
    })
  }
}

/**
 * Validate scenario configuration.
 * Throws if validation fails.
 * @throws {ValidationError} When the scenario configuration is invalid
 */
export function validateScenarioConfig(config: ScenarioConfig): void {
  const errors: ValidationError[] = []

  validateIdField(config, errors)

  if (!config.name || config.name.trim() === '') {
    errors.push({ field: 'name', message: 'name is required' })
  }

  if (config.description.trim() === '') {
    errors.push({ field: 'description', message: 'description is required' })
  }

  collectPersonaValidationErrors(config, errors)

  if (typeof config.duration !== 'number' || config.duration <= 0) {
    errors.push({ field: 'duration', message: 'duration must be a positive number' })
  }

  validateRampUp(config, errors)

  if (config.assertions.length === 0) {
    errors.push({ field: 'assertions', message: 'at least one assertion is required' })
  }

  validateDuplicates(config, errors)

  if (errors.length > 0) {
    const messages = errors.map((e) => `  - ${e.field}: ${e.message}`).join('\n')
    throw new CoreValidationError(`Invalid scenario configuration:\n${messages}`, {
      code: 'VALIDATION.SCENARIO.INVALID_CONFIG',
      metadata: { errors },
    })
  }
}

// =============================================================================
// LOGGER
// =============================================================================

function createScenarioLogger(scenarioId: string): ScenarioLogger {
  return {
    info: (message, data) => {
      logger.info({ evt: 'simulation.scenario.info', scenarioId, msg: message, ...data })
    },
    warn: (message, data) => {
      logger.warn({ evt: 'simulation.scenario.warn', scenarioId, msg: message, ...data })
    },
    error: (message, data) => {
      logger.error({ evt: 'simulation.scenario.error', err: data?.['err'] instanceof Error ? data['err'] : undefined, scenarioId, msg: message, ...data })
    },
    debug: (message, data) => {
      logger.debug({ evt: 'simulation.scenario.debug', scenarioId, msg: message, ...data })
    },
  }
}

// =============================================================================
// EXECUTION
// =============================================================================

/**
 * Create a standard executor for scenarios without custom execute function.
 * Runs a self-contained mock simulation loop.
 */
// @fitness-ignore-next-line file-length-limits -- Simulation executor: sequential phase orchestration (init, ramp, sustain, cooldown) requires contiguous control flow
function createStandardExecutor(
  config: ScenarioConfig,
): (context: ScenarioExecutionContext) => Promise<ScenarioExecutorResult> {
  return async (context) => {
    const targetRps = config.targetRps ?? getEstimatedRps(config.personas)
    context.logger.info('Starting standard scenario execution', {
      duration: config.duration,
      personas: config.personas.length,
      targetRps,
    })

    const metrics: SimulationMetrics = createEmptyMetrics()
    const latencyTracker = new LatencyTracker()
    const signals: Signal[] = []
    const durationMs = config.duration * 1000
    const rampUpMs = (config.rampUp ?? 0) * 1000
    const tickIntervalMs = 100
    const startTime = Date.now()

    while (Date.now() - startTime < durationMs) {
      if (context.abortSignal.aborted) break

      const elapsed = Date.now() - startTime
      const rampUpProgress = rampUpMs > 0 ? Math.min(1, elapsed / rampUpMs) : 1
      const currentRps = targetRps * rampUpProgress
      const requestsThisTick = Math.floor(currentRps / (1000 / tickIntervalMs))

      for (let i = 0; i < requestsThisTick; i++) {
        if (context.abortSignal.aborted) break

        // Simulate an action with random latency
        const latency = Math.random() * 50 + 1
        metrics.totalRequests++
        latencyTracker.record(latency)

        // 95% success rate by default
        if (Math.random() < 0.95) {
          metrics.successfulRequests++
        } else {
          metrics.failedRequests++
          metrics.errorsGenerated++
        }
      }

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, tickIntervalMs)
        if (context.abortSignal.aborted) {
          clearTimeout(timeout)
          resolve()
        }
      })
    }

    const snapshot = latencyTracker.getLatencySnapshot()
    metrics.avgLatencyMs = snapshot.avgLatencyMs
    metrics.p50LatencyMs = snapshot.p50LatencyMs
    metrics.p95LatencyMs = snapshot.p95LatencyMs
    metrics.p99LatencyMs = snapshot.p99LatencyMs
    metrics.findingsGenerated = signals.length

    return ScenarioResultBuilder.create(config.id)
      .withMetrics(metrics)
      .withDuration(config.duration)
      .evaluateAssertions(config.assertions)
      .addSignals(signals)
      .build()
  }
}

/** @throws {ValidationError} When the execute function is not provided */
function createCustomExecutor(
  config: ScenarioConfig,
): (context: ScenarioExecutionContext) => Promise<ScenarioExecutorResult> {
  if (!config.execute) {
    // @fitness-ignore-next-line result-pattern-consistency -- internal factory function, exceptions propagate to caller
    throw new CoreValidationError('execute function is required for custom executor', {
      code: 'VALIDATION.SCENARIO.MISSING_EXECUTOR',
    })
  }

  const customFn = config.execute

  return (context) => {
    context.logger.info('Starting custom scenario execution')
    return customFn(context)
  }
}

function createRunnableScenario(config: ScenarioConfig): RunnableScenario {
  const executor = config.execute ? createCustomExecutor(config) : createStandardExecutor(config)

  return Object.freeze({
    id: config.id,
    name: config.name,
    description: config.description,
    type: config.type,
    tags: Object.freeze([...config.tags]),

    run:
      /** @throws {ScenarioAbortedError} When the scenario is aborted via AbortSignal */
      async (abortSignal: AbortSignal): Promise<ScenarioExecutorResult> => {
      const correlationId = `scenario-${config.id}-${Date.now().toString(36)}`

      const context: ScenarioExecutionContext = {
        scenarioId: config.id,
        correlationId,
        abortSignal,
        logger: createScenarioLogger(config.id),
      }

      if (abortSignal.aborted) {
        throw new ScenarioAbortedError(config.id)
      }

      try {
        return await executor(context)
      } catch (error) {
        if (abortSignal.aborted) {
          throw new ScenarioAbortedError(config.id)
        }
        throw error
      }
    },

    getConfig: () => Object.freeze({ ...config }),
  })
}

// =============================================================================
// MAIN API
// =============================================================================

/**
 * Define a simulation scenario with automatic registration.
 *
 * @example
 * ```typescript
 * export const myScenario = defineScenario({
 *   id: 'my-scenario',
 *   name: 'My Scenario',
 *   description: 'Tests typical user flows',
 *   type: 'happy-path',
 *   tags: ['smoke'],
 *   personas: [
 *     persona('buyer', 10),
 *     persona('seller', 5),
 *   ],
 *   duration: 300,
 *   assertions: [
 *     ASSERTIONS.lowErrorRate(),
 *     ASSERTIONS.lowLatency('p95', 500),
 *   ],
 * });
 * ```
 * @throws {ValidationError} When the scenario configuration is invalid
 */
export function defineScenario(config: ScenarioConfig): RunnableScenario {
  validateScenarioConfig(config)

  const scenario = createRunnableScenario(config)

  scenarioRegistry.register(scenario)

  return scenario
}

/**
 * Define a scenario without auto-registration.
 * Useful for testing or temporary scenarios.
 * @throws {ValidationError} When the scenario configuration is invalid (missing id)
 */
export function defineScenarioWithoutRegistration(config: ScenarioConfig): RunnableScenario {
  const errors: ValidationError[] = []

  if (!config.id || config.id.trim() === '') {
    errors.push({ field: 'id', message: 'id is required' })
  }

  if (errors.length > 0) {
    const messages = errors.map((e) => `  - ${e.field}: ${e.message}`).join('\n')
    // @fitness-ignore-next-line result-pattern-consistency -- definition-time validation, throw is appropriate
    throw new CoreValidationError(`Invalid scenario configuration:\n${messages}`, {
      code: 'VALIDATION.SCENARIO.INVALID_CONFIG',
      metadata: { errors },
    })
  }

  return createRunnableScenario(config)
}
