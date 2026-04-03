import { defineCheck, type CheckViolation } from '@opensip-tools/core';

export const noConsoleLog = defineCheck({
  id: '550e8400-e29b-41d4-a716-446655440001',
  slug: 'no-console-log',
  description: 'Detects console.log statements in production code',
  scope: { languages: ['typescript', 'javascript'], concerns: ['backend', 'frontend'] },
  tags: ['quality', 'logging'],
  analyze: (content, filePath) => {
    const violations: CheckViolation[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comments
      if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;
      // Skip test files
      if (filePath.includes('.test.') || filePath.includes('__tests__')) continue;

      if (/\bconsole\.(log|dir|table)\b/.test(line)) {
        violations.push({
          message: `console.${line.match(/console\.(log|dir|table)/)?.[1]} found — use a structured logger instead`,
          severity: 'error',
          line: i + 1,
          suggestion: 'Replace with a structured logger call',
        });
      }
    }

    return violations;
  },
});
