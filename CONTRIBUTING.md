# Contributing to OpenSIP Tools

Thanks for your interest in contributing! This guide covers how to set up the project, write checks, and submit changes.

## Setup

```bash
git clone https://github.com/opensip-ai/opensip-tools.git
cd opensip-tools
pnpm install
pnpm build
```

### Verify your setup

```bash
pnpm typecheck    # TypeScript compilation
pnpm test         # Run all tests
pnpm fit          # Run fitness checks against this repo
```

## Project Structure

```
packages/
  cli/              # CLI binary (Ink/React for terminal UI)
  core/             # Framework: defineCheck, registry, recipes, plugins
  checks-builtin/   # Built-in fitness checks
  simulation/       # Simulation engine [experimental]
```

## Writing a Fitness Check

Checks are defined with `defineCheck()` from `@opensip-tools/core`:

```typescript
import { defineCheck, type CheckViolation } from '@opensip-tools/core';

export const myCheck = defineCheck({
  id: 'unique-uuid-here',       // Generate with: node -e "console.log(crypto.randomUUID())"
  slug: 'my-check-slug',        // Kebab-case, unique
  description: 'What this check does',
  scope: {
    languages: ['typescript'],   // Which file types to scan
    concerns: ['backend'],       // Which targets to match
  },
  tags: ['quality'],             // Used by recipes and --tags filter

  analyze(content: string, filePath: string): CheckViolation[] {
    const violations: CheckViolation[] = [];

    // Your detection logic here
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('TODO')) {
        violations.push({
          line: i + 1,
          message: 'Found a TODO comment',
          severity: 'warning',
          suggestion: 'Resolve or create a ticket for this TODO',
          filePath,
        });
      }
    }

    return violations;
  },
});
```

### Check fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | UUID — unique identifier |
| `slug` | Yes | Kebab-case name (e.g., `no-console-log`) |
| `description` | Yes | One-line description |
| `scope` | Yes | `languages` and `concerns` for file targeting |
| `tags` | Yes | Array of tags for categorization |
| `analyze` | Yes* | Function that receives file content and returns violations |
| `analyzeAll` | Yes* | Alternative: receives a `FileAccessor` for cross-file analysis |
| `command` | Yes* | Alternative: runs an external tool (e.g., Semgrep) |
| `longDescription` | No | Detailed markdown description |
| `confidence` | No | `'high'`, `'medium'`, or `'low'` |
| `disabled` | No | Set `true` to disable by default |
| `itemType` | No | What the check validates: `'files'`, `'packages'`, `'modules'`, etc. |
| `timeout` | No | Timeout in ms (default: 30000) |

*One of `analyze`, `analyzeAll`, or `command` is required.

### Where to put checks

Built-in checks go in `packages/checks-builtin/src/checks/` organized by category:
- `architecture/` — structural patterns
- `quality/` — code quality and style
- `resilience/` — error handling and robustness
- `security/` — security vulnerabilities
- `testing/` — test quality
- `documentation/` — docs and comments

After creating a check file:
1. Export the check from the category's `index.ts` barrel file
2. Add a display entry in `packages/checks-builtin/src/display/`

### Custom checks (plugin)

For checks that aren't suitable for the built-in set, create a plugin:

```bash
mkdir -p ~/.opensip-tools/fit/
```

Drop a `.js` file there with `export const checks = [...]`, or publish as an npm package and install with `opensip-tools plugin install <package>`.

## Writing Tests

We use Vitest. Test files go next to the source as `*.test.ts` (or `*.test.tsx` for Ink components).

```bash
pnpm test                                    # All tests
pnpm --filter=@opensip-tools/core test       # Core tests only
pnpm --filter=@opensip-tools/cli test        # CLI tests only
```

### Testing Ink components

```typescript
import { render } from 'ink-testing-library';
import { ThemeProvider } from '../ui/theme.js';
import { MyComponent } from '../ui/components/MyComponent.js';

it('renders correctly', () => {
  const { lastFrame } = render(
    <ThemeProvider>
      <MyComponent prop="value" />
    </ThemeProvider>,
  );
  expect(lastFrame()).toContain('expected text');
});
```

## Before Submitting a PR

```bash
pnpm build       # Must pass
pnpm typecheck   # Must pass
pnpm test        # Must pass
```

## Code Style

- TypeScript strict mode
- ESM (`"type": "module"`) — use `.js` extensions in imports
- Ink components use `.tsx` extension
- No hardcoded colors in UI — use `useTheme()` from `ui/theme.ts`
- Commands return data objects — rendering is the UI layer's job
- Structured logging via `logger` from `@opensip-tools/core`

## Reporting Issues

Open an issue at https://github.com/opensip-ai/opensip-tools/issues with:
- What you expected
- What happened
- Steps to reproduce
- Node.js version and OS
