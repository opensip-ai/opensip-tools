# JSON Output Schema (v1.0)

The `--json` flag produces structured output on stdout.

## Schema

| Field | Type | Description |
|-------|------|-------------|
| version | `"1.0"` | Schema version (breaking changes bump this) |
| tool | `"fit" \| "sim"` | Which tool produced the output |
| timestamp | string (ISO 8601) | When the run started |
| recipe | string? | Recipe name (if applicable) |
| score | number (0-100) | Pass percentage |
| passed | boolean | Whether the run passed |
| summary.total | number | Total checks run |
| summary.passed | number | Checks that passed |
| summary.failed | number | Checks that failed |
| summary.errors | number | Total error-level findings |
| summary.warnings | number | Total warning-level findings |
| checks[] | array | Per-check results |
| checks[].checkSlug | string | Check identifier |
| checks[].passed | boolean | Whether this check passed |
| checks[].findings[] | array | Violation details |
| checks[].findings[].ruleId | string | Rule that triggered |
| checks[].findings[].message | string | Human-readable description |
| checks[].findings[].severity | `"error" \| "warning"` | Finding severity |
| checks[].findings[].filePath | string? | File path |
| checks[].findings[].line | number? | Line number |
| checks[].findings[].column | number? | Column number |
| checks[].findings[].suggestion | string? | Fix suggestion |
| checks[].durationMs | number | Check execution time in ms |
| durationMs | number | Total run time in ms |
