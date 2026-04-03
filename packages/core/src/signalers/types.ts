/**
 * @fileoverview Signalers configuration types — derived from Zod schemas
 */

import type { z } from 'zod'

import type { FitnessSchema, SignalersConfigSchema, SimulationSchema } from './schema.js'

/** Recursively marks all properties as readonly. */
type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K]
}

/** Fitness check configuration from signalers config. */
export type SignalersFitnessConfig = DeepReadonly<z.infer<typeof FitnessSchema>>
/** Simulation engine configuration from signalers config. */
export type SignalersSimulationConfig = DeepReadonly<z.infer<typeof SimulationSchema>>
/** Top-level signalers configuration. */
export type SignalersConfig = DeepReadonly<z.infer<typeof SignalersConfigSchema>>
