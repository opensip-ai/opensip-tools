import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

import { loadPlugin, loadAllPlugins } from '../loader.js'
import { defaultRegistry } from '../../framework/registry.js'
import type { DiscoveredPlugin } from '../types.js'

let testDir: string
let initialRegistrySize: number

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'opensip-loader-test-'))
  initialRegistrySize = defaultRegistry.size
})

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true })
})

describe('loadPlugin', () => {
  it('loads a plugin that exports an empty checks array', async () => {
    const pluginFile = join(testDir, 'empty-plugin.mjs')
    writeFileSync(pluginFile, `
      export const checks = [];
      export const metadata = { name: 'empty', version: '1.0.0' };
    `)

    const plugin: DiscoveredPlugin = {
      type: 'file',
      entryPoint: pluginFile,
      namespace: 'empty-plugin',
      source: 'empty-plugin.mjs',
    }

    const result = await loadPlugin(plugin)
    expect(result.checksRegistered).toBe(0)
    expect(result.error).toBeUndefined()
    expect(result.namespace).toBe('empty-plugin')
  })

  it('handles plugin that throws on import', async () => {
    const pluginFile = join(testDir, 'broken-plugin.mjs')
    writeFileSync(pluginFile, 'throw new Error("plugin init failed")')

    const plugin: DiscoveredPlugin = {
      type: 'file',
      entryPoint: pluginFile,
      namespace: 'broken',
      source: 'broken-plugin.mjs',
    }

    const result = await loadPlugin(plugin)
    expect(result.checksRegistered).toBe(0)
    expect(result.error).toContain('plugin init failed')
  })

  it('handles plugin with no exports gracefully', async () => {
    const pluginFile = join(testDir, 'no-exports.mjs')
    writeFileSync(pluginFile, '// nothing exported')

    const plugin: DiscoveredPlugin = {
      type: 'file',
      entryPoint: pluginFile,
      namespace: 'no-exports',
      source: 'no-exports.mjs',
    }

    const result = await loadPlugin(plugin)
    expect(result.checksRegistered).toBe(0)
    expect(result.recipesRegistered).toBe(0)
    expect(result.error).toBeUndefined()
  })

  it('skips non-Check objects in checks array', async () => {
    const pluginFile = join(testDir, 'bad-checks.mjs')
    writeFileSync(pluginFile, `
      export const checks = [
        { notACheck: true },
        "string",
        42,
        null,
      ];
    `)

    const plugin: DiscoveredPlugin = {
      type: 'file',
      entryPoint: pluginFile,
      namespace: 'bad-checks',
      source: 'bad-checks.mjs',
    }

    const result = await loadPlugin(plugin)
    expect(result.checksRegistered).toBe(0)
    expect(result.error).toBeUndefined()
  })
})

describe('loadAllPlugins', () => {
  it('returns empty result when no plugins found', async () => {
    const result = await loadAllPlugins('fit', join(testDir, 'nonexistent'))
    expect(result.plugins).toEqual([])
    expect(result.totalChecks).toBe(0)
    expect(result.totalRecipes).toBe(0)
    expect(result.errors).toEqual([])
  })

  it('aggregates results from multiple plugins', async () => {
    const fitDir = join(testDir, 'fit')
    mkdirSync(fitDir, { recursive: true })
    writeFileSync(join(fitDir, 'a.mjs'), 'export const checks = []')
    writeFileSync(join(fitDir, 'b.mjs'), 'export const checks = []')

    const result = await loadAllPlugins('fit', testDir)
    expect(result.plugins).toHaveLength(2)
  })

  it('collects errors from failed plugins', async () => {
    const fitDir = join(testDir, 'fit')
    mkdirSync(fitDir, { recursive: true })
    writeFileSync(join(fitDir, 'ok.mjs'), 'export const checks = []')
    writeFileSync(join(fitDir, 'bad.mjs'), 'throw new Error("boom")')

    const result = await loadAllPlugins('fit', testDir)
    expect(result.plugins).toHaveLength(2)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('boom')
  })
})
