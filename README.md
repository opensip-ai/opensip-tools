# OpenSIP Tools

Open-source codebase analysis toolkit. Run fitness checks against any TypeScript/JavaScript codebase — standalone in the CLI, in CI pipelines, or integrated with [OpenSIP Cloud](https://opensip.ai) for centralized reporting.

## Installation

### npm (recommended)

```bash
npm install -g @opensip-tools/cli

cd your-project
opensip-tools fit
```

### npx (no install)

```bash
npx @opensip-tools/cli fit
```

### From source

```bash
git clone https://github.com/opensip-ai/opensip-tools.git
cd opensip-tools
pnpm install && pnpm build
node packages/cli/dist/index.js fit
```

## Commands

```bash
opensip-tools fit              # Run fitness checks
opensip-tools fit --verbose    # Show detailed results table
opensip-tools fit --findings   # Show table + per-check violation details
opensip-tools fit --json       # Structured JSON output (for CI)
opensip-tools fit --list       # List all available checks
opensip-tools fit --recipes    # List available recipes

opensip-tools init             # Generate opensip-tools.config.yml
opensip-tools dashboard        # Generate HTML report and open in browser
opensip-tools sessions list    # Show stored session history
opensip-tools sessions purge   # Delete session data (with confirmation)
opensip-tools plugin list      # List installed plugins
opensip-tools sim              # Run simulations [experimental]
```

## Fitness Checks

Run `opensip-tools fit` to scan your codebase. Default output is a compact summary:

```
120 Passed, 10 Failed (423 Errors, 227 Warnings) | Duration 8.1s
```

Use `--verbose` for the full results table, or `--findings` for detailed violation output.

### Options

```bash
opensip-tools fit                               # Run all checks (default recipe)
opensip-tools fit --cwd /path/to/project        # Target a different directory
opensip-tools fit --recipe quick-smoke          # Use a named recipe
opensip-tools fit --check no-console-log        # Run a single check
opensip-tools fit --tags security               # Filter by tag
opensip-tools fit --exclude no-any-types        # Exclude specific checks
opensip-tools fit --report-to http://localhost:4919  # Send SARIF to OpenSIP
opensip-tools fit --debug                       # Structured log output to stderr
```

### Recipes

Pre-defined check sets for common scenarios:

| Recipe | Description |
|--------|------------|
| `default` | All enabled checks |
| `quick-smoke` | Fast critical checks |
| `backend` | Backend-focused (architecture, resilience) |
| `frontend` | Frontend-focused (React, accessibility) |
| `security` | Comprehensive security analysis |
| `pre-commit` | Fast checks for git hooks |
| `ci` | Optimized for CI pipelines |
| `architecture` | Architecture validation |

### Check Tags

Checks are organized by tags: `security`, `quality`, `architecture`, `testing`, `resilience`, `observability`, `accessibility`, and more. Use `--tags` to filter or `--list` to browse all checks.

## Configuration

Generate a config file with `opensip-tools init`:

```yaml
# opensip-tools.config.yml

globalExcludes:
  - "docs/**"

targets:
  backend:
    description: Backend source code
    languages: [typescript]
    concerns: [backend, server, api]
    include:
      - "src/**/*.ts"
    exclude:
      - "**/*.test.ts"
      - "**/node_modules/**"

fitness:
  failOnErrors: 1      # Exit code 1 if errors >= this (default: 1)
  failOnWarnings: 0    # Exit code 1 if warnings >= this (default: 0, warnings don't fail)
  disabledChecks: []
```

### CI/CD Exit Codes

By default, any check error causes exit code 1 (CI fails). Configure thresholds:

- `failOnErrors: 1` — fail if total errors >= 1 (default)
- `failOnErrors: 0` — report-only mode, never fail on errors
- `failOnWarnings: 1` — strict mode, warnings also cause failure

## Plugins

Install community check packs or write your own:

```bash
# Install a plugin
opensip-tools plugin install @company/checks-custom

# List installed plugins
opensip-tools plugin list

# Remove a plugin
opensip-tools plugin remove @company/checks-custom
```

### Custom Checks

Drop a `.js` or `.mjs` file in `~/.opensip-tools/fit/`:

```javascript
// ~/.opensip-tools/fit/my-check.js
import { defineCheck } from '@opensip-tools/core';

export const checks = [
  defineCheck({
    id: 'custom-uuid-here',
    slug: 'my-custom-check',
    description: 'My custom check',
    scope: { languages: ['typescript'], concerns: ['backend'] },
    tags: ['custom'],
    analyze(content, filePath) {
      const violations = [];
      // ... your logic
      return violations;
    },
  }),
];
```

Or publish as an npm package with `export const checks = [...]`.

## Cloud Integration

Send findings to OpenSIP Cloud as SARIF:

```bash
opensip-tools fit --report-to https://your-opensip-instance/api/ingest --api-key sk-...
```

Findings are posted in SARIF 2.1.0 format with automatic retry on network failures.

## CI Integration

### GitHub Actions

```yaml
- name: Run fitness checks
  run: npx @opensip-tools/cli fit --json > fitness-report.json

- name: Upload to OpenSIP
  run: npx @opensip-tools/cli fit --report-to ${{ secrets.OPENSIP_URL }} --api-key ${{ secrets.OPENSIP_KEY }}
```

### JSON Output

```json
{
  "version": "1.0",
  "tool": "fit",
  "timestamp": "2026-04-02T18:00:00.000Z",
  "recipe": "default",
  "score": 92,
  "passed": true,
  "summary": {
    "total": 124,
    "passed": 120,
    "failed": 4,
    "errors": 12,
    "warnings": 45
  },
  "checks": [
    {
      "checkSlug": "no-console-log",
      "passed": false,
      "findings": [
        {
          "ruleId": "no-console-log",
          "message": "console.log found in production code",
          "severity": "error",
          "filePath": "src/utils.ts",
          "line": 42
        }
      ],
      "durationMs": 150
    }
  ],
  "durationMs": 8100
}
```

## Dashboard

Generate an HTML report with session history:

```bash
opensip-tools dashboard
```

The dashboard shows:
- Run history with trends
- Per-check results and pass rates
- Check catalog with tags and confidence levels
- Recipe catalog

## Session Management

```bash
opensip-tools sessions list                  # Show run history
opensip-tools sessions purge                 # Delete all sessions (prompts y/n)
opensip-tools sessions purge --older-than 7  # Delete sessions older than 7 days
opensip-tools sessions purge --yes           # Skip confirmation
```

## Observability

Every CLI invocation generates a `runId` (ULID) for log correlation. Structured JSON logs are written to `~/.opensip-tools/logs/`.

```bash
opensip-tools fit --debug    # Show structured log events on stderr
```

Log files rotate daily, keeping the last 7 days.

## Architecture

Turborepo + pnpm monorepo:

```
packages/
  cli/             # @opensip-tools/cli — CLI binary (Ink/React)
  core/            # @opensip-tools/core — Framework, registry, recipes
  checks-builtin/  # @opensip-tools/checks-builtin — Built-in fitness checks
  simulation/      # @opensip-tools/simulation — Simulation engine [experimental]
```

## License

MIT
