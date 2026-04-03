import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

import { discoverPlugins, getPluginDir } from '../discover.js'

let testDir: string

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), 'opensip-plugins-test-'))
})

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true })
})

describe('getPluginDir', () => {
  it('returns domain subdirectory of base dir', () => {
    expect(getPluginDir('fit', '/base')).toBe('/base/fit')
    expect(getPluginDir('sim', '/base')).toBe('/base/sim')
    expect(getPluginDir('asm', '/base')).toBe('/base/asm')
  })
})

describe('discoverPlugins', () => {
  it('returns empty array when directory does not exist', () => {
    const result = discoverPlugins('fit', join(testDir, 'nonexistent'))
    expect(result).toEqual([])
  })

  it('returns empty array when directory is empty', () => {
    mkdirSync(join(testDir, 'fit'), { recursive: true })
    const result = discoverPlugins('fit', testDir)
    expect(result).toEqual([])
  })

  describe('loose files', () => {
    it('discovers .js files', () => {
      const fitDir = join(testDir, 'fit')
      mkdirSync(fitDir, { recursive: true })
      writeFileSync(join(fitDir, 'my-check.js'), 'export const checks = []')

      const result = discoverPlugins('fit', testDir)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        type: 'file',
        namespace: 'my-check',
        source: 'my-check.js',
      })
    })

    it('discovers .mjs files', () => {
      const fitDir = join(testDir, 'fit')
      mkdirSync(fitDir, { recursive: true })
      writeFileSync(join(fitDir, 'plugin.mjs'), 'export const checks = []')

      const result = discoverPlugins('fit', testDir)
      expect(result).toHaveLength(1)
      expect(result[0]!.source).toBe('plugin.mjs')
    })

    it('ignores non-js files', () => {
      const fitDir = join(testDir, 'fit')
      mkdirSync(fitDir, { recursive: true })
      writeFileSync(join(fitDir, 'readme.txt'), 'not a plugin')
      writeFileSync(join(fitDir, 'data.json'), '{}')

      const result = discoverPlugins('fit', testDir)
      expect(result).toEqual([])
    })

    it('ignores directories when scanning loose files', () => {
      const fitDir = join(testDir, 'fit')
      mkdirSync(join(fitDir, 'subdir'), { recursive: true })

      const result = discoverPlugins('fit', testDir)
      expect(result).toEqual([])
    })
  })

  describe('npm packages', () => {
    it('discovers packages with package.json and main field', () => {
      const pkgDir = join(testDir, 'fit', 'node_modules', 'my-plugin')
      mkdirSync(pkgDir, { recursive: true })
      writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({
        name: 'my-plugin',
        main: './index.js',
      }))
      writeFileSync(join(pkgDir, 'index.js'), 'export const checks = []')

      const result = discoverPlugins('fit', testDir)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        type: 'package',
        namespace: 'my-plugin',
        source: 'my-plugin',
      })
    })

    it('discovers scoped packages', () => {
      const pkgDir = join(testDir, 'fit', 'node_modules', '@scope', 'checks')
      mkdirSync(pkgDir, { recursive: true })
      writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({
        name: '@scope/checks',
        main: './dist/index.js',
      }))
      mkdirSync(join(pkgDir, 'dist'))
      writeFileSync(join(pkgDir, 'dist', 'index.js'), 'export const checks = []')

      const result = discoverPlugins('fit', testDir)
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        type: 'package',
        namespace: '@scope/checks',
      })
    })

    it('skips packages without entry point', () => {
      const pkgDir = join(testDir, 'fit', 'node_modules', 'broken')
      mkdirSync(pkgDir, { recursive: true })
      writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({
        name: 'broken',
        main: './nonexistent.js',
      }))

      const result = discoverPlugins('fit', testDir)
      expect(result).toEqual([])
    })

    it('skips directories without package.json', () => {
      const pkgDir = join(testDir, 'fit', 'node_modules', 'not-a-package')
      mkdirSync(pkgDir, { recursive: true })
      writeFileSync(join(pkgDir, 'index.js'), 'export const checks = []')

      const result = discoverPlugins('fit', testDir)
      expect(result).toEqual([])
    })

    it('uses exports["."] when available', () => {
      const pkgDir = join(testDir, 'fit', 'node_modules', 'exports-pkg')
      mkdirSync(pkgDir, { recursive: true })
      writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({
        name: 'exports-pkg',
        exports: { '.': './lib/main.js' },
      }))
      mkdirSync(join(pkgDir, 'lib'))
      writeFileSync(join(pkgDir, 'lib', 'main.js'), 'export const checks = []')

      const result = discoverPlugins('fit', testDir)
      expect(result).toHaveLength(1)
      expect(result[0]!.entryPoint).toContain('lib/main.js')
    })
  })

  describe('mixed discovery', () => {
    it('discovers both packages and loose files', () => {
      const fitDir = join(testDir, 'fit')
      mkdirSync(fitDir, { recursive: true })
      writeFileSync(join(fitDir, 'loose.js'), 'export const checks = []')

      const pkgDir = join(fitDir, 'node_modules', 'pkg')
      mkdirSync(pkgDir, { recursive: true })
      writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name: 'pkg', main: './index.js' }))
      writeFileSync(join(pkgDir, 'index.js'), 'export const checks = []')

      const result = discoverPlugins('fit', testDir)
      expect(result).toHaveLength(2)
      expect(result.find(p => p.type === 'package')).toBeDefined()
      expect(result.find(p => p.type === 'file')).toBeDefined()
    })
  })
})
