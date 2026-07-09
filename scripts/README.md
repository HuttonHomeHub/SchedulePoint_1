# scripts/

Repository automation and developer-convenience scripts. Keep scripts:

- **POSIX-friendly** (`#!/usr/bin/env bash`, `set -euo pipefail`),
- **idempotent** — safe to run more than once,
- **documented** — a header comment explaining purpose and usage.

| Script               | Purpose                                                                           |
| -------------------- | --------------------------------------------------------------------------------- |
| `setup.sh`           | Bootstrap local development (deps, `.env`, local Postgres).                       |
| `verify-template.sh` | Materialise, type-check, and unit-test the reference feature template (ADR-0015). |

Prefer adding cross-cutting commands as `package.json` scripts (run via
Turborepo) so they are discoverable and cached; reserve this directory for
shell glue that doesn't fit the Node task runner.
