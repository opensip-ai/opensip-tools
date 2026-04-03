/**
 * @fileoverview Enforce secure secrets access patterns
 * @invariants standard
 * @module cli/devtools/fitness/src/checks/security/secrets-access
 * @version 2.1.0
 */

import { logger } from '@opensip-tools/core/logger'

import { defineCheck, type CheckViolation } from '@opensip-tools/core'
import { isCommentLine } from '../../utils/index.js'

// Patterns that indicate direct secrets access
const DIRECT_SECRETS_PATTERNS = [
  /process\.env\.[A-Z_]*(?:SECRET|KEY|PASSWORD|TOKEN|CREDENTIAL)/i,
  /process\.env\.\w+/, // General env access outside config
]

// Allowed patterns (in config modules and bootstrap code)
const SECRET_ACCESS_CONTEXTS = [
  // Config files
  '/config/',
  '/configuration/',
  '.config.ts',
  'config.ts',
  // Bootstrap code - runs before config is initialized
  '/bootstrap/',
  '/bootstrap.ts',
  'bootstrap.ts',
  // CLI and scripts - config layer may not be available
  '/cli/',
  '/bin/',
  '/scripts/',
  '/tools/',
  // Environment setup files
  '/env/',
  'env.ts',
  '.env.ts',
  // Test setup
  '/vitest.setup.ts',
  '/setup.ts',
  'setup.ts',
  // DevTools internal
  '/devtools/',
  // DI and adapter layers - wiring code that reads config at composition time
  '/adapters/',
  '/providers/',
  '/di-composition/',
  '/di-registration/',
  '/factories/',
]

// Safe environment variables that are commonly accessed directly
const SAFE_ENV_PATTERNS = [
  /NODE_ENV/, // Production safety checks
  /CI/, // CI detection
  /DEBUG/, // Debug flags
  /LOG_LEVEL/, // Logging configuration
  /PORT/, // Server port (non-sensitive)
  /HOST/, // Server host (non-sensitive)
  /HOSTNAME/, // Container hostname
  /HOME/, // User home directory
  /PATH/, // System path
  /PWD/, // Current directory
  /USER/, // Current user
  /SHELL/, // User shell
  /TERM/, // Terminal type
  /TZ/, // Timezone
  /AWS_REGION/, // AWS region (non-sensitive)
  /npm_package_version/, // Package version from npm
  /SERVICE_VERSION/, // Service version identifier
  /BUILD_TIME/, // Build timestamp
  /CORS_ORIGIN/, // CORS origin configuration
  /OTEL_/, // OpenTelemetry configuration
  /REDIS_URL/, // Redis connection URL (infrastructure config)
  /DATABASE_URL/, // Database connection URL (infrastructure config)
]

/**
 * Check if an environment variable access is for a safe, non-sensitive variable
 */
function isSafeEnvAccess(line: string): boolean {
  logger.debug({
    evt: 'fitness.checks.secrets_access.is_safe_env_access',
    msg: 'Checking if env access is safe',
  })
  return SAFE_ENV_PATTERNS.some((pattern) => pattern.test(line))
}

function checkLineForEnvViolation(
  line: string,
  lineNum: number,
  filePath: string,
): CheckViolation | null {
  logger.debug({
    evt: 'fitness.checks.secrets_access.check_line_for_env_violation',
    msg: 'Checking line for env violation',
  })
  if (isCommentLine(line)) {
    return null
  }

  const envMatch = /process\.env\.\w+/.exec(line)
  if (!envMatch) {
    return null
  }

  if (isSafeEnvAccess(line)) {
    return null
  }

  const sensitivePattern = DIRECT_SECRETS_PATTERNS[0]
  const isSensitive = sensitivePattern?.test(line) ?? false

  return {
    line: lineNum + 1,
    column: envMatch.index,
    message: isSensitive
      ? 'Direct access to sensitive environment variable - use configuration layer'
      : 'Direct process.env access outside configuration layer',
    severity: isSensitive ? 'error' : 'warning',
    suggestion:
      'Access configuration through a centralized config module instead of direct process.env access. This centralizes validation and provides type safety.',
    match: envMatch[0],
    filePath,
  }
}

/**
 * Check: security/secrets-access
 *
 * Ensures secrets are accessed through the configuration layer,
 * not directly via process.env in application code.
 *
 */
export const secretsAccess = defineCheck({
  id: '38c247ff-ec0c-4502-82a8-b444385ee73d',
  slug: 'secrets-access',
  disabled: true,
  scope: { languages: ['typescript'], concerns: ['backend', 'server'] },
  contentFilter: 'code-only',

  confidence: 'medium',
  description:
    'Enforce centralized secrets access: flag direct process.env access for sensitive vars (SECRET/KEY/PASSWORD/TOKEN) outside config modules',
  longDescription: `**Purpose:** Enforces that secrets and configuration values are accessed through the centralized config layer, not directly via \`process.env\` in application code.

**Detects:**
- \`process.env.XXX_SECRET\`, \`process.env.XXX_KEY\`, \`process.env.XXX_PASSWORD\`, \`process.env.XXX_TOKEN\`, \`process.env.XXX_CREDENTIAL\` outside config modules (error severity)
- Any \`process.env.XXX\` access outside config, bootstrap, CLI, scripts, env setup, or devtools paths (warning severity)
- Safe env vars are excluded: NODE_ENV, CI, DEBUG, LOG_LEVEL, PORT, HOST, HOSTNAME, HOME, PATH, PWD, USER, SHELL, TERM, TZ

**Why it matters:** Scattered \`process.env\` access bypasses validation, loses type safety, and makes secrets harder to audit. The config layer centralizes secret management and enables rotation.

**Scope:** Codebase-specific convention enforcing centralized secrets access. Analyzes each file individually.`,
  tags: ['security', 'secrets', 'configuration'],
  fileTypes: ['ts'],

  analyze(content: string, filePath: string): CheckViolation[] {
    logger.debug({
      evt: 'fitness.checks.secrets_access.analyze',
      msg: 'Analyzing file for secrets access violations',
    })
    if (SECRET_ACCESS_CONTEXTS.some((p) => filePath.includes(p))) {
      return []
    }

    const lines = content.split('\n')
    const violations: CheckViolation[] = []

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const violation = checkLineForEnvViolation(lines[lineNum] ?? '', lineNum, filePath)
      if (violation) {
        violations.push(violation)
      }
    }

    return violations
  },
})
