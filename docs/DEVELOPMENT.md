# Development guide

How to set up a local environment and work day-to-day.

## Prerequisites

| Tool    | Version    | Notes                                               |
| ------- | ---------- | --------------------------------------------------- |
| Node.js | ≥ 22 (LTS) | Use the version in [`.nvmrc`](../.nvmrc); `nvm use` |
| pnpm    | ≥ 10       | `corepack enable` provides the pinned version       |
| Docker  | recent     | For local PostgreSQL / full-stack compose           |
| Git     | recent     | —                                                   |

## First-time setup

```bash
corepack enable            # enable pnpm at the version pinned in package.json
./scripts/setup.sh         # deps + .env + local Postgres (idempotent)
```

`setup.sh` copies [`.env.example`](../.env.example) to `.env`. Review it and set
real secrets before connecting to real services. **Never commit `.env`.**

## Running

```bash
pnpm dev            # run web + api in watch mode (Turborepo orchestrates)
```

- Web dev server: <http://localhost:5173> (proxies `/api` to the API).
- API: <http://localhost:3000>.

Run a single app:

```bash
pnpm --filter @repo/web dev
pnpm --filter @repo/api dev
```

Full stack in containers:

```bash
docker compose up -d       # db + api + web
docker compose logs -f api
docker compose down        # add -v to also drop the database volume
```

## Database & Prisma

```bash
pnpm --filter @repo/api prisma:migrate    # create/apply a dev migration
pnpm --filter @repo/api prisma:generate   # regenerate the client
pnpm --filter @repo/api prisma:studio     # browse data
```

Migrations are committed. Any schema change is reviewed and, where feasible,
backward-compatible (expand/contract).

## Everyday commands

| Command                             | Description                              |
| ----------------------------------- | ---------------------------------------- |
| `pnpm lint` / `pnpm lint:fix`       | Lint (and auto-fix) the workspace        |
| `pnpm format` / `pnpm format:check` | Format / check formatting                |
| `pnpm typecheck`                    | Type-check all packages                  |
| `pnpm test` / `pnpm test:e2e`       | Run unit tests / the default e2e suites  |
| `pnpm build`                        | Build everything                         |
| `pnpm commit`                       | Guided Conventional Commit               |
| `pnpm changeset`                    | Record a user-visible change for release |
| `pnpm clean`                        | Remove build output and caches           |

## Flag-scoped end-to-end suites

Large frontend changes ship behind a feature flag (see
[ARCHITECTURE.md](ARCHITECTURE.md) §8), and each carries its **own** Playwright
directory that runs with that flag forced on — `pnpm test:e2e` alone does not
cover them. Each has a matching CI step, and each is run with its own filter:

```bash
pnpm --filter @repo/web test:e2e            # the default (flag-off) journeys
pnpm --filter @repo/web test:e2e:library    # e.g. the library-scoping journey
```

`ls apps/web/e2e*` is the authoritative list of suites; `apps/web/package.json`
maps each directory to its script and the flags it forces. When you add a flag,
add its suite and its CI step in the same pull request — a flag with no flag-on
journey is untested in the state users will actually see.

The flag-**off** unit suites are equally load-bearing: they are the rollback
contract, and are never weakened to make a change pass.

## Monorepo notes

- **Turborepo** runs tasks across packages with caching; task graph is in
  [`turbo.json`](../turbo.json).
- **pnpm workspaces** link local packages; reference them as `@repo/*` and pin
  shared dependency versions via the catalog in
  [`pnpm-workspace.yaml`](../pnpm-workspace.yaml).
- Add a dependency to a specific package:
  `pnpm --filter @repo/web add <pkg>`.

## Git hooks

Husky installs hooks on `pnpm install`:

- **pre-commit:** `lint-staged` formats staged files with Prettier. (Linting
  and type-checking are enforced by `turbo` in CI to keep commits fast and
  reliable across the monorepo; run `pnpm lint` yourself before pushing.)
- **commit-msg:** commitlint enforces Conventional Commits.

## Editor

VS Code users get recommended extensions and workspace settings from
[`.vscode/`](../.vscode). Formatting on save and ESLint flat-config are
pre-wired. Any editor that respects [`.editorconfig`](../.editorconfig) works.

## Troubleshooting

- **`pnpm` not found:** run `corepack enable`.
- **Type errors after pulling:** `pnpm install` then
  `pnpm --filter @repo/api prisma:generate`.
- **Port already in use:** stop the process on 5173/3000/5432 or adjust ports
  in `.env` / compose.
- **Stale build issues:** `pnpm clean && pnpm install`.
