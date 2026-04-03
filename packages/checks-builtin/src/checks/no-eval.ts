import { defineCheck, type CheckViolation } from '@opensip-tools/core';

// Security check: this file DETECTS dangerous patterns in source code via regex string matching.
// It does NOT execute any dynamic code.

const EVAL_PATTERN = /\beval\s*\(/;

export const noEvalCheck = defineCheck({
  id: '550e8400-e29b-41d4-a716-446655440002',
  slug: 'no-eval',
  description: 'Detects dangerous dynamic code execution patterns in source code',
  scope: { languages: ['typescript', 'javascript'], concerns: ['backend', 'frontend'] },
  tags: ['security'],
  analyze: (content, _filePath) => {
    const violations: CheckViolation[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;

      if (EVAL_PATTERN.test(line)) {
        violations.push({
          message: 'Dynamic code execution detected — this is a security risk',
          severity: 'error',
          line: i + 1,
          suggestion: 'Use JSON.parse() for data or a sandboxed interpreter',
        });
      }
    }

    return violations;
  },
});
