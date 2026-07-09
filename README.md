<div align="center">

# 🧱 Blank App

**A production-grade monorepo starter for building applications.**

[![CI](https://github.com/HuttonHomeHub/blank-app/actions/workflows/ci.yml/badge.svg)](https://github.com/HuttonHomeHub/blank-app/actions/workflows/ci.yml)
[![CodeQL](https://github.com/HuttonHomeHub/blank-app/actions/workflows/codeql.yml/badge.svg)](https://github.com/HuttonHomeHub/blank-app/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Conventional Commits](https://img.shields.io/badge/Commits-Conventional-fe5196.svg)](https://www.conventionalcommits.org)

</div>

> **Project status: base repository (no application features).** This is a clean,
> domain-neutral foundation — structure, tooling, CI/CD, containers,
> documentation, standards, a delivery process, and a canonical feature template.
> Fork it, replace this README with your app's, and build features from the
> template. See the [roadmap](docs/ROADMAP.md).

Blank App gives a new application a solid, opinionated starting point: a
TypeScript monorepo with a React web client and a NestJS API, strict tooling,
tests, CI/CD, and documented engineering standards — so teams start building
features on day one instead of wiring up foundations.

### Using this as your base

1. Fork/clone and rename the repo and the root `package.json` name.
2. Replace the `HuttonHomeHub/blank-app` placeholders with your GitHub org/repo — they
   appear in the README badges, [`CODEOWNERS`](.github/CODEOWNERS),
   [`.changeset/config.json`](.changeset/config.json),
   [`SECURITY.md`](SECURITY.md), and [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
3. Optionally rename the `@repo/*` package scope to your own.
4. Replace this README, `CLAUDE.md` §1, `docs/ROADMAP.md`, and `docs/BACKLOG.md`
   with your application's content.
5. Build your first feature from the reference template
   ([`docs/REFERENCE_FEATURE.md`](docs/REFERENCE_FEATURE.md)) via the delivery
   process ([`docs/PROCESS.md`](docs/PROCESS.md)).

## ✨ Tech stack

- **Monorepo:** [Turborepo](https://turbo.build) + [pnpm](https://pnpm.io) workspaces
- **Frontend:** [React](https://react.dev) + [TypeScript](https://www.typescriptlang.org) + [Vite](https://vite.dev), [Tailwind CSS v4](https://tailwindcss.com), [shadcn/ui](https://ui.shadcn.com), [Lucide](https://lucide.dev)
- **Backend:** [NestJS](https://nestjs.com) + TypeScript
- **Database:** [PostgreSQL](https://www.postgresql.org) via [Prisma](https://www.prisma.io)
- **API:** REST, documented with [OpenAPI](https://swagger.io/specification/)
- **Auth:** [Better Auth](https://www.better-auth.com) (self-hosted) — see [ADR-0003](docs/adr/0003-authentication-with-better-auth.md)
- **Testing:** [Vitest](https://vitest.dev), [Supertest](https://github.com/ladjs/supertest), [Playwright](https://playwright.dev)
- **CI/CD:** GitHub Actions → images on the GitHub Container Registry

## 📁 Repository layout

```text
apps/
  web/        React + Vite client        (@repo/web)
  api/        NestJS REST API            (@repo/api)
packages/
  config/     Shared ESLint + tsconfig   (@repo/config)
  types/      Shared cross-boundary types (@repo/types)
docs/         Architecture, guides, ADRs, roadmap
scripts/      Repository automation
```

## 🚀 Quick start

**Prerequisites:** Node.js ≥ 22 (see [`.nvmrc`](.nvmrc)), pnpm ≥ 10 (via
`corepack enable`), and Docker (for local PostgreSQL).

```bash
# 1. Clone and enter
git clone https://github.com/HuttonHomeHub/blank-app.git && cd blank-app

# 2. Bootstrap (installs deps, creates .env, starts Postgres)
./scripts/setup.sh

# 3. Run everything in dev mode
pnpm dev
```

Or run the full stack in containers:

```bash
cp .env.example .env
docker compose up -d
```

## 🧑‍💻 Common commands

| Command          | Description                             |
| ---------------- | --------------------------------------- |
| `pnpm dev`       | Run all apps in watch mode (Turborepo)  |
| `pnpm build`     | Build all packages/apps                 |
| `pnpm lint`      | Lint the whole workspace                |
| `pnpm format`    | Format with Prettier                    |
| `pnpm typecheck` | Type-check the whole workspace          |
| `pnpm test`      | Run unit tests                          |
| `pnpm test:e2e`  | Run end-to-end tests                    |
| `pnpm changeset` | Record a versioned, user-visible change |

## 📚 Documentation

| Document                                                         | Purpose                                    |
| ---------------------------------------------------------------- | ------------------------------------------ |
| [`CLAUDE.md`](CLAUDE.md)                                         | Project operating manual (source of truth) |
| [`docs/PROCESS.md`](docs/PROCESS.md)                             | How features go from idea to shipped       |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)                   | System design and boundaries               |
| [`docs/FRONTEND_ARCHITECTURE.md`](docs/FRONTEND_ARCHITECTURE.md) | Frontend architecture & patterns           |
| [`docs/BACKEND_ARCHITECTURE.md`](docs/BACKEND_ARCHITECTURE.md)   | Backend architecture & patterns            |
| [`docs/DATABASE.md`](docs/DATABASE.md)                           | Database standards & philosophy            |
| [`docs/SECURITY_STANDARDS.md`](docs/SECURITY_STANDARDS.md)       | Security engineering standards             |
| [`docs/OBSERVABILITY.md`](docs/OBSERVABILITY.md)                 | Logging, metrics, tracing, health          |
| [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md)                     | Performance & scalability standards        |
| [`docs/REFERENCE_FEATURE.md`](docs/REFERENCE_FEATURE.md)         | The canonical backend feature template     |
| [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md)                 | Design tokens, theming, components         |
| [`docs/UX_STANDARDS.md`](docs/UX_STANDARDS.md)                   | Project-wide UX principles                 |
| [`docs/COMPONENT_LIBRARY.md`](docs/COMPONENT_LIBRARY.md)         | Component guidelines & lifecycle           |
| [`docs/FRONTEND_QUALITY.md`](docs/FRONTEND_QUALITY.md)           | FE testing, a11y, perf, bundle             |
| [`docs/API.md`](docs/API.md)                                     | REST/OpenAPI conventions                   |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)                     | Local dev environment guide                |
| [`docs/TESTING.md`](docs/TESTING.md)                             | Test strategy and tooling                  |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)                       | Release & deployment                       |
| [`docs/ROADMAP.md`](docs/ROADMAP.md)                             | Direction and milestones                   |
| [`docs/adr/`](docs/adr/)                                         | Architecture Decision Records              |
| [`.claude/agents/`](.claude/agents/)                             | Specialised frontend & backend agents      |
| [`CONTRIBUTING.md`](CONTRIBUTING.md)                             | How to contribute                          |
| [`SECURITY.md`](SECURITY.md)                                     | Reporting vulnerabilities                  |

## 🤝 Contributing

Contributions are welcome — please read [`CONTRIBUTING.md`](CONTRIBUTING.md) and
our [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) first. All commits follow
[Conventional Commits](https://www.conventionalcommits.org/).

## 📄 License

[MIT](LICENSE) © The Blank App authors
