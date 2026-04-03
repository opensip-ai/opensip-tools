# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Ink-based CLI rendering with themed components (React for terminals)
- Commander.js for argument parsing with auto-generated `--help`
- `opensip-tools dashboard` — top-level HTML report command
- `opensip-tools sessions list` — view run history
- `opensip-tools sessions purge` — delete session data with confirmation
- `--verbose` flag shows detailed results table (default is compact summary)
- `--findings` flag shows per-check violation details
- `--debug` flag outputs structured JSON logs to stderr
- `--report-to` sends findings as SARIF 2.1.0 with retry on failure
- `failOnErrors` / `failOnWarnings` config for CI exit code control
- Structured JSON logging with ULID run IDs to `~/.opensip-tools/logs/`
- Theme system with terminal capability detection (NO_COLOR, tmux, truecolor)
- Shared animation clock for spinner
- `RunHeader` component showing tool info between banner and content
- Custom check plugin support via `~/.opensip-tools/fit/`
- `itemType` support in `defineCheck()` for accurate validated column display
- `withRetry()` utility for network calls with exponential backoff
- Result pattern (`ok()`, `err()`, `tryCatchAsync()`) in core
- `NetworkError`, `ConfigurationError` typed error classes
- ULID-based ID generation (`generatePrefixedId()`, `extractTimestamp()`)

### Changed
- CLI output layer migrated from raw console.log to Ink components
- Default `fit` output is now a single summary line (was full table)
- Score and PASS/FAIL removed from summary — data speaks for itself
- `Ignored` renamed to `Ignores` in table and summary
- `Validated` column shows human-readable format (`450 files`, `13 packages`, `—`)
- Replaced `successThreshold` with `failOnErrors`/`failOnWarnings`
- 3rd party tool checks auto-detect package manager (pnpm > yarn > npm)
- Knip dead-code check uses default config discovery (no hardcoded path)
- Missing tool detection: shows "{tool} is not installed" instead of cryptic errors

### Removed
- `opensip-tools asm` command and `@opensip-tools/assess` package
- 28 OpenSIP-specific fitness checks (moved to community plugin)
- 6 OpenSIP-specific tool checks (hardcoded paths)
- 3 OpenSIP-specific assessments
- `fit --dashboard` (replaced by top-level `dashboard` command)
- `fit --history` (replaced by `sessions list`)
- Score-based pass/fail from summary display
