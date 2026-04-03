import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { checks } from '../index.js';

describe('checks-builtin', () => {
  it('exports a non-empty array of checks', () => {
    expect(checks.length).toBeGreaterThan(50);
  });

  it('all checks have required fields', () => {
    for (const check of checks) {
      expect(check.config.id).toBeDefined();
      expect(check.config.slug).toBeDefined();
      expect(check.config.description).toBeDefined();
      expect(check.config.tags).toBeDefined();
      expect(check.config.tags.length).toBeGreaterThan(0);
    }
  });

  it('all check slugs are unique', () => {
    const slugs = checks.map((c) => c.config.slug);
    const duplicates = slugs.filter((s, i) => slugs.indexOf(s) !== i);
    expect(duplicates).toEqual([]);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('all check IDs are unique', () => {
    const ids = checks.map((c) => c.config.id);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(duplicates).toEqual([]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all checks have a valid analysisMode', () => {
    for (const check of checks) {
      expect(['analyze', 'analyzeAll', 'command']).toContain(check.config.analysisMode);
    }
  });

  it('all checks have a run function', () => {
    for (const check of checks) {
      expect(typeof check.run).toBe('function');
    }
  });
});

describe('no-console-log check', () => {
  const check = checks.find((c) => c.config.slug === 'no-console-log');

  let tmpDir: string;
  let violatingFile: string;
  let cleanFile: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'checks-builtin-test-'));
    violatingFile = path.join(tmpDir, 'violating.ts');
    cleanFile = path.join(tmpDir, 'clean.ts');

    fs.writeFileSync(violatingFile, 'const x = 1;\nconsole.log("hello");\nconst y = 2;\n');
    fs.writeFileSync(cleanFile, 'const x = 1;\nconst y = 2;\n');
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exists', () => {
    expect(check).toBeDefined();
  });

  it('detects console.log in a file', async () => {
    const result = await check!.run(tmpDir, { targetFiles: [violatingFile] });
    expect(result.errors + result.warnings).toBeGreaterThan(0);
    expect(result.passed).toBe(false);
  });

  it('passes clean files', async () => {
    const result = await check!.run(tmpDir, { targetFiles: [cleanFile] });
    expect(result.errors + result.warnings).toBe(0);
    expect(result.passed).toBe(true);
  });
});
