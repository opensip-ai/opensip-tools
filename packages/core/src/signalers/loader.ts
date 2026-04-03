// @fitness-ignore-file toctou-race-condition -- cache check + populate is synchronous (sync file I/O + Map.set); no async gap, safe in single-threaded Node.js
/**
 * @fileoverview Load and cache opensip-tools.config.yml
 *
 * Reads the signalers config file from the project root, validates it with Zod,
 * and returns a frozen SignalersConfig. Falls back to defaults if the file is missing.
 */

import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { ValidationError, SystemError } from '../lib/errors.js'
import yaml from 'js-yaml'

const deepFreeze = <T>(obj: T): T => JSON.parse(JSON.stringify(obj)) as T
import { logger } from '../lib/logger.js'

import { SignalersConfigSchema } from './schema.js'
import type { SignalersConfig } from './types.js'

const SIGNALERS_FILENAME = 'opensip-tools.config.yml'
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

/** TTL for cached signalers config entries in milliseconds (30 seconds) */
const SIGNALERS_CACHE_TTL_MS = 30_000

interface CacheEntry {
  config: SignalersConfig
  cachedAt: number
}

const cache = new Map<string, CacheEntry>()

/**
 * Read the raw signalers config file from disk.
 * @returns File contents, or null if not found.
 * @throws {SystemError} When the config file exceeds the maximum allowed size
 * @throws {ValidationError} When the config file cannot be read (non-ENOENT errors)
 */
function readSignalersFile(rootDir: string): string | null {
  try {
    const filePath = join(rootDir, SIGNALERS_FILENAME)
    const stats = statSync(filePath)
    if (stats.size > MAX_FILE_SIZE) {
      throw new SystemError(`Config file too large (${stats.size} bytes, max ${MAX_FILE_SIZE}): ${filePath}`, { code: 'SYSTEM.FILE.TOO_LARGE' })
    }
    return readFileSync(filePath, 'utf-8')
  } catch (err) {
    if (err instanceof ValidationError || err instanceof SystemError) throw err
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    const message = err instanceof Error ? err.message : String(err)
    throw new ValidationError(
      `Failed to read ${SIGNALERS_FILENAME} from ${rootDir}: ${message}`,
      {
        operation: 'load',
        loader: 'signalers',
        filePath: join(rootDir, SIGNALERS_FILENAME),
        cause: err instanceof Error ? err : undefined,
      },
    )
  }
}

/** @throws {ValidationError} When the YAML content is invalid */
function parseYaml(raw: string): unknown {
  try {
    return yaml.load(raw) ?? {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new ValidationError(`${SIGNALERS_FILENAME} contains invalid YAML: ${message}`, {
      operation: 'load',
      loader: 'signalers',
      cause: err instanceof Error ? err : undefined,
    })
  }
}

/**
 * Load and validate opensip-tools.config.yml from the given root directory.
 *
 * Results are cached per rootDir. Returns default configuration if
 * the file does not exist.
 *
 * @param rootDir - Absolute path to the project root directory
 * @returns Frozen, validated SignalersConfig object (falls back to defaults on error)
 */
export function loadSignalersConfig(rootDir: string): SignalersConfig {
  const cached = cache.get(rootDir)
  if (cached && (Date.now() - cached.cachedAt) < SIGNALERS_CACHE_TTL_MS) {
    return cached.config
  }

  let raw: string | null
  try {
    raw = readSignalersFile(rootDir)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.warn({
      evt: 'core.signalers.config.read_error',
      module: 'core:signalers',
      file: join(rootDir, SIGNALERS_FILENAME),
      error: message,
      msg: `Failed to read ${SIGNALERS_FILENAME}: ${message}. Falling back to defaults.`,
    })
    raw = null
  }

  let parsed: unknown
  try {
    parsed = raw ? parseYaml(raw) : {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.warn({
      evt: 'core.signalers.config.yaml_error',
      module: 'core:signalers',
      file: join(rootDir, SIGNALERS_FILENAME),
      error: message,
      msg: `${SIGNALERS_FILENAME} contains invalid YAML: ${message}. Falling back to defaults.`,
    })
    parsed = {}
  }

  const result = SignalersConfigSchema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message} (expected: ${i.code})`)
      .join('\n')
    logger.warn({
      evt: 'core.signalers.config.validation_error',
      module: 'core:signalers',
      file: join(rootDir, SIGNALERS_FILENAME),
      issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message, code: i.code })),
      msg: `${SIGNALERS_FILENAME} validation failed — falling back to defaults:\n${issues}`,
    })
  }

  const data = result.success ? result.data : SignalersConfigSchema.parse({})
  const targetCount = Object.keys(data.targets).length

  logger.info({
    evt: 'core.signalers.config.loaded',
    module: 'core:signalers',
    file: SIGNALERS_FILENAME,
    hasFitness: data.fitness !== undefined,
    hasSimulation: data.simulation !== undefined,
    targetCount,
  })

  const frozen = deepFreeze(data as unknown as Record<string, unknown>) as unknown as SignalersConfig
  cache.set(rootDir, { config: frozen, cachedAt: Date.now() })
  return frozen
}

/**
 * Clear the cached signalers config. Useful for testing.
 */
export function resetSignalersConfigCache(): void {
  cache.clear()
}
