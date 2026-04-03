/**
 * CloudReportStatus component — renders the result of a cloud report upload.
 */

import React from 'react';
import { Text, Box } from 'ink';
import { useTheme } from '../theme.js';

export interface CloudReportStatusProps {
  readonly url: string;
  readonly findingCount: number;
  readonly runCount: number;
  readonly success: boolean;
  readonly error?: string;
}

export function CloudReportStatus({ url, findingCount, runCount, success, error }: CloudReportStatusProps): React.ReactElement {
  const theme = useTheme();

  if (!success) {
    return (
      <Box flexDirection="column" paddingLeft={2}>
        <Text>
          <Text color={theme.error}>{'\u2717'}</Text>
          {' '}
          Failed to report to <Text dimColor>{url}</Text>
        </Text>
        {error && <Text dimColor>{'    '}{error}</Text>}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Text>
        <Text color={theme.success}>{'\u2714'}</Text>
        {' '}
        Reported to <Text dimColor>{url}</Text>
      </Text>
      <Text dimColor>
        {'    '}
        {findingCount} findings from {runCount} checks
      </Text>
    </Box>
  );
}
