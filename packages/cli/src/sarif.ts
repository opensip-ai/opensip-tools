import { withRetry, logger } from '@opensip-tools/core';
import type { CliOutput } from './types.js';

/** Result of a cloud report upload */
export interface ReportResult {
  readonly url: string;
  readonly findingCount: number;
  readonly runCount: number;
  readonly success: boolean;
  readonly error?: string;
}

/** Build a SARIF 2.1.0 log from CLI output — one run per check slug */
export function buildSarifLog(output: CliOutput): Record<string, unknown> {
  const runs = [];

  for (const ch of output.checks) {
    if (ch.findings.length === 0) continue;

    const ruleIds = new Set<string>();
    const results = [];

    for (const f of ch.findings) {
      ruleIds.add(f.ruleId);

      const result: Record<string, unknown> = {
        ruleId: f.ruleId,
        message: { text: f.message },
        level: f.severity === 'error' ? 'error' : 'warning',
      };

      if (f.filePath) {
        result.locations = [{
          physicalLocation: {
            artifactLocation: { uri: f.filePath },
            region: {
              ...(f.line != null ? { startLine: f.line } : {}),
              ...(f.column != null ? { startColumn: f.column } : {}),
            },
          },
        }];
      }

      if (f.suggestion) {
        result.fixes = [{ description: { text: f.suggestion } }];
      }

      results.push(result);
    }

    runs.push({
      tool: {
        driver: {
          name: ch.checkSlug,
          version: '1.0.0',
          rules: [...ruleIds].map((id) => ({ id })),
        },
      },
      results,
    });
  }

  return {
    version: '2.1.0' as const,
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
    runs,
  };
}

export async function reportToCloud(output: CliOutput, url: string, apiKey?: string): Promise<ReportResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-API-Key'] = apiKey;

  const sarifLog = buildSarifLog(output);
  const runs = sarifLog.runs as unknown[];
  if (runs.length === 0) {
    return { url, findingCount: 0, runCount: 0, success: true };
  }

  // Send as SARIF to /api/ingest/sarif (append /sarif to the base ingest URL)
  const sarifUrl = url.endsWith('/sarif') ? url : `${url}/sarif`;
  const cwd = process.cwd();
  const target = cwd ? `${sarifUrl}?cwd=${encodeURIComponent(cwd)}` : sarifUrl;
  const totalFindings = output.checks.reduce((n, ch) => n + ch.findings.length, 0);

  try {
    const res = await withRetry(
      () => fetch(target, {
        method: 'POST',
        headers,
        body: JSON.stringify(sarifLog),
        signal: AbortSignal.timeout(30_000),
      }),
      {
        maxAttempts: 3,
        initialDelayMs: 500,
        maxDelayMs: 5000,
        onRetry: (attempt, error, delayMs) => {
          logger.info({
            evt: 'cli.report.error',
            attempt,
            error: error.message,
            delayMs,
            url: sarifUrl,
          });
        },
      },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        url: sarifUrl,
        findingCount: totalFindings,
        runCount: runs.length,
        success: false,
        error: `${res.status} ${res.statusText} ${body}`.trim(),
      };
    }

    return {
      url: sarifUrl,
      findingCount: totalFindings,
      runCount: runs.length,
      success: true,
    };
  } catch (err) {
    return {
      url: sarifUrl,
      findingCount: totalFindings,
      runCount: runs.length,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
