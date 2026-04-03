/**
 * Findings component — renders detailed check violations grouped by check.
 */

import React from 'react';
import { Text, Box } from 'ink';
import { useTheme } from '../theme.js';

export interface FindingViolation {
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly file?: string;
  readonly line?: number;
  readonly suggestion?: string;
}

export interface FindingCheck {
  readonly checkSlug: string;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly error?: string;
  readonly violations?: readonly FindingViolation[];
}

export interface FindingsProps {
  readonly checks: readonly FindingCheck[];
}

export function Findings({ checks }: FindingsProps): React.ReactElement {
  const theme = useTheme();

  const total = checks.reduce(
    (sum, c) => sum + c.errorCount + c.warningCount + (c.error ? 1 : 0),
    0,
  );

  const relevant = checks.filter(
    (c) => c.errorCount > 0 || c.warningCount > 0 || c.error,
  );

  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Text>
        <Text bold>Findings</Text>
        {' '}
        <Text dimColor>({total})</Text>
        :
      </Text>
      <Text> </Text>
      {relevant.map((check) => {
        const count = check.errorCount + check.warningCount + (check.error ? 1 : 0);
        return (
          <Box key={check.checkSlug} flexDirection="column" marginLeft={2}>
            <Text>
              <Text color={theme.brand}>{check.checkSlug}</Text>
              {' '}
              <Text dimColor>({count})</Text>
            </Text>

            {check.error && (
              <Text>
                {'      '}
                <Text color={theme.error}>error</Text>
                {'  '}
                {check.error}
              </Text>
            )}

            {check.violations?.map((v, i) => {
              const loc = v.file
                ? `${v.file}${v.line ? `:${v.line}` : ''}`
                : '';
              return (
                <Box key={i} flexDirection="column">
                  <Text>
                    {'      '}
                    <Text color={v.severity === 'error' ? theme.error : theme.warning}>
                      {v.severity === 'error' ? 'error' : 'warn'}
                    </Text>
                    {'  '}
                    {v.message}
                    {loc ? ' ' : ''}
                    {loc && <Text dimColor>{loc}</Text>}
                  </Text>
                  {v.suggestion && (
                    <Text dimColor>{'            '}{v.suggestion}</Text>
                  )}
                </Box>
              );
            })}

            <Text> </Text>
          </Box>
        );
      })}
    </Box>
  );
}
