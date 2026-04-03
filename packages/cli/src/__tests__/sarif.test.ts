import { describe, it, expect } from 'vitest';
import { buildSarifLog } from '../sarif.js';
import type { CliOutput } from '../types.js';

function makeSampleOutput(): CliOutput {
  return {
    version: '1.0',
    tool: 'fit',
    timestamp: '2026-03-31T00:00:00.000Z',
    score: 85,
    passed: true,
    summary: { total: 2, passed: 1, failed: 1, errors: 2, warnings: 1 },
    durationMs: 1500,
    checks: [
      {
        checkSlug: 'no-console-log',
        passed: false,
        durationMs: 100,
        findings: [
          {
            ruleId: 'no-console-log',
            message: 'console.log found',
            severity: 'error',
            filePath: 'src/index.ts',
            line: 42,
            column: 5,
          },
          {
            ruleId: 'no-console-log',
            message: 'console.warn found',
            severity: 'warning',
            filePath: 'src/utils.ts',
            line: 10,
            suggestion: 'Use a logger',
          },
        ],
      },
      {
        checkSlug: 'require-error-handling',
        passed: true,
        durationMs: 80,
        findings: [],
      },
    ],
  };
}

describe('buildSarifLog', () => {
  it('returns SARIF 2.1.0 structure', () => {
    const sarif = buildSarifLog(makeSampleOutput());

    expect(sarif.version).toBe('2.1.0');
    expect(sarif.$schema).toContain('sarif-schema-2.1.0');
    expect(Array.isArray(sarif.runs)).toBe(true);
  });

  it('creates one run per check with findings', () => {
    const sarif = buildSarifLog(makeSampleOutput());
    const runs = sarif.runs as Array<Record<string, unknown>>;

    // Only 1 check has findings (no-console-log); require-error-handling has 0
    expect(runs).toHaveLength(1);
  });

  it('uses check slug as tool driver name', () => {
    const sarif = buildSarifLog(makeSampleOutput());
    const runs = sarif.runs as Array<{ tool: { driver: { name: string } } }>;

    expect(runs[0]!.tool.driver.name).toBe('no-console-log');
  });

  it('includes file locations in results', () => {
    const sarif = buildSarifLog(makeSampleOutput());
    const runs = sarif.runs as Array<{ results: Array<Record<string, unknown>> }>;
    const results = runs[0]!.results;

    expect(results).toHaveLength(2);

    // First result has full location
    const first = results[0] as { locations: Array<{ physicalLocation: { artifactLocation: { uri: string }; region: { startLine?: number; startColumn?: number } } }> };
    expect(first.locations[0]!.physicalLocation.artifactLocation.uri).toBe('src/index.ts');
    expect(first.locations[0]!.physicalLocation.region.startLine).toBe(42);
    expect(first.locations[0]!.physicalLocation.region.startColumn).toBe(5);
  });

  it('maps severity to SARIF levels', () => {
    const sarif = buildSarifLog(makeSampleOutput());
    const runs = sarif.runs as Array<{ results: Array<{ level: string }> }>;
    const results = runs[0]!.results;

    expect(results[0]!.level).toBe('error');
    expect(results[1]!.level).toBe('warning');
  });

  it('includes suggestions as fixes', () => {
    const sarif = buildSarifLog(makeSampleOutput());
    const runs = sarif.runs as Array<{ results: Array<Record<string, unknown>> }>;
    const second = runs[0]!.results[1] as { fixes: Array<{ description: { text: string } }> };

    expect(second.fixes[0]!.description.text).toBe('Use a logger');
  });

  it('includes rule IDs in driver rules', () => {
    const sarif = buildSarifLog(makeSampleOutput());
    const runs = sarif.runs as Array<{ tool: { driver: { rules: Array<{ id: string }> } } }>;

    const ruleIds = runs[0]!.tool.driver.rules.map((r) => r.id);
    expect(ruleIds).toContain('no-console-log');
  });

  it('returns empty runs for output with no findings', () => {
    const output = makeSampleOutput();
    // Clear all findings
    const cleanOutput: CliOutput = {
      ...output,
      checks: output.checks.map((ch) => ({ ...ch, findings: [] })),
    };

    const sarif = buildSarifLog(cleanOutput);
    const runs = sarif.runs as unknown[];
    expect(runs).toHaveLength(0);
  });
});
