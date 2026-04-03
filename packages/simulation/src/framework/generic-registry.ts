/**
 * Generic dual-key registry with tag-based filtering.
 * Copied from @opensip/core/registry for standalone use.
 */

import { ValidationError } from '@opensip-tools/core';

export interface Registerable {
  readonly id: string;
  readonly name: string;
  readonly tags?: readonly string[];
}

export class GenericRegistry<T extends Registerable> {
  private readonly byId = new Map<string, T>();
  private readonly byName = new Map<string, T>();
  private readonly moduleName: string;

  constructor(moduleName: string) {
    this.moduleName = moduleName;
  }

  register(item: T): void {
    if (this.byId.has(item.id)) return; // Skip duplicates silently
    this.byId.set(item.id, item);
    this.byName.set(item.name, item);
  }

  get(idOrName: string): T | undefined {
    return this.byId.get(idOrName) ?? this.byName.get(idOrName);
  }

  has(idOrName: string): boolean {
    return this.byId.has(idOrName) || this.byName.has(idOrName);
  }

  getAll(): T[] {
    return [...this.byId.values()];
  }

  getByTag(tag: string): T[] {
    return this.getAll().filter(item => item.tags?.includes(tag));
  }

  get size(): number {
    return this.byId.size;
  }

  clear(): void {
    this.byId.clear();
    this.byName.clear();
  }
}
