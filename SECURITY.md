# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in opensip-tools, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

### How to report

1. **GitHub Security Advisories (preferred):** Use [GitHub's private vulnerability reporting](https://github.com/opensip-ai/opensip-tools/security/advisories/new) to submit a report directly.

2. **Email:** Send details to security@opensip.ai

### What to include

- Description of the vulnerability
- Steps to reproduce
- Affected versions
- Potential impact
- Suggested fix (if any)

### Response timeline

- **Acknowledgment:** Within 48 hours
- **Initial assessment:** Within 5 business days
- **Fix timeline:** Depends on severity; critical issues are prioritized

### Scope

This policy covers:
- `@opensip-tools/cli` — the CLI binary
- `@opensip-tools/core` — the framework
- `@opensip-tools/checks-builtin` — built-in fitness checks
- `@opensip-tools/simulation` — simulation engine

### Out of scope

- Community plugins installed via `opensip-tools plugin install`
- Issues in upstream dependencies (report those to the respective projects)

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |

We recommend always running the latest version.
