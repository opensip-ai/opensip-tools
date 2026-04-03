/**
 * plugin command — manage installed plugins
 */

import type { PluginDomain } from '@opensip-tools/core';
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import type { PluginResult } from '../types.js';

// ---------------------------------------------------------------------------
// Plugin helpers
// ---------------------------------------------------------------------------

export function inferDomain(packageName: string): PluginDomain {
  if (/\bsim\b/.test(packageName)) return 'sim';
  return 'fit';
}

export async function pluginList(): Promise<PluginResult> {
  const { discoverPlugins } = await import('@opensip-tools/core');
  const domains: PluginDomain[] = ['fit', 'sim'];

  const plugins: Array<{ domain: string; namespace: string; pluginType: 'package' | 'file' }> = [];

  for (const domain of domains) {
    const found = discoverPlugins(domain);
    for (const plugin of found) {
      plugins.push({
        domain,
        namespace: plugin.namespace,
        pluginType: plugin.type,
      });
    }
  }

  return {
    type: 'plugin',
    action: 'list',
    plugins,
    totalCount: plugins.length,
  };
}

export async function pluginInstall(packageName: string | undefined, domainOverride?: string): Promise<PluginResult> {
  if (!packageName) {
    return {
      type: 'plugin',
      action: 'install',
      packageName: '',
      success: false,
      error: 'No package name provided. Usage: opensip-tools plugin install <package-name>',
    };
  }

  const domain = (domainOverride as PluginDomain) ?? inferDomain(packageName);
  const { getPluginDir } = await import('@opensip-tools/core');
  const dir = getPluginDir(domain);

  // Ensure directory and package.json exist
  mkdirSync(dir, { recursive: true });
  const pkgJsonPath = join(dir, 'package.json');
  if (!existsSync(pkgJsonPath)) {
    writeFileSync(pkgJsonPath, JSON.stringify({
      name: `opensip-tools-${domain}-plugins`,
      version: '0.0.0',
      private: true,
      type: 'module',
      dependencies: {},
    }, null, 2));
  }

  try {
    execFileSync('npm', ['install', packageName], { cwd: dir, stdio: 'inherit' });
    return {
      type: 'plugin',
      action: 'install',
      packageName,
      success: true,
    };
  } catch {
    return {
      type: 'plugin',
      action: 'install',
      packageName,
      success: false,
      error: `Failed to install ${packageName}`,
    };
  }
}

export async function pluginRemove(packageName: string | undefined, domainOverride?: string): Promise<PluginResult> {
  if (!packageName) {
    return {
      type: 'plugin',
      action: 'remove',
      packageName: '',
      success: false,
      error: 'No package name provided. Usage: opensip-tools plugin remove <package-name>',
    };
  }

  const domain = (domainOverride as PluginDomain) ?? inferDomain(packageName);
  const { getPluginDir } = await import('@opensip-tools/core');
  const dir = getPluginDir(domain);

  if (!existsSync(join(dir, 'package.json'))) {
    return {
      type: 'plugin',
      action: 'remove',
      packageName,
      success: false,
      error: `No plugins installed in ${domain}/`,
    };
  }

  try {
    execFileSync('npm', ['uninstall', packageName], { cwd: dir, stdio: 'inherit' });
    return {
      type: 'plugin',
      action: 'remove',
      packageName,
      success: true,
    };
  } catch {
    return {
      type: 'plugin',
      action: 'remove',
      packageName,
      success: false,
      error: `Failed to remove ${packageName}`,
    };
  }
}
