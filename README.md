<div align="center">

# 📐 SchedulePoint

**Browser-based construction scheduling, built around a Time-Scaled Logic Diagram.**

[![CI](https://github.com/HuttonHomeHub/SchedulePoint_1/actions/workflows/ci.yml/badge.svg)](https://github.com/HuttonHomeHub/SchedulePoint_1/actions/workflows/ci.yml)
[![CodeQL](https://github.com/HuttonHomeHub/SchedulePoint_1/actions/workflows/codeql.yml/badge.svg)](https://github.com/HuttonHomeHub/SchedulePoint_1/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Conventional Commits](https://img.shields.io/badge/Commits-Conventional-fe5196.svg)](https://www.conventionalcommits.org)

</div>

> **Project status: SchedulePoint is substantially built.** 19 API modules, 25
> Prisma models across 41 migrations, a React client with 15 flag-scoped
> Playwright suites, and 57 ADRs. The CPM/GPM engine is real and its conformance
> matrix is closed (ADR-0034). The main gap is the Gantt view; the deployment
> target is still undecided. See the [roadmap](docs/ROADMAP.md) and
> [project brief](docs/PROJECT_BRIEF.md).

SchedulePoint is a browser-based **construction scheduling** application built
around a **Time-Scaled Logic Diagram** as its primary editing surface: planners
draw activities directly on a timeline and connect them with logic, rather than
filling in a Gantt grid. It delivers the CPM/GPM feature set construction
planners actually use — four dependency types with lag, calendars, constraints,
progress, floats, baselines and resources — with a live critical path and
collaborative, browser-native team use.

It grew out of a domain-neutral base repository, which is why packages are still
scoped `@repo/*`; the engineering foundation that came with it (TypeScript
monorepo, strict tooling, CI/CD, containers, documented standards) is still the
substrate.

New here? Start with the [project brief](docs/PROJECT_BRIEF.md) for what the
product is, [`CLAUDE.md`](CLAUDE.md) for how we work, and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how the system is put
together — including an explicit list of the things it deliberately does not
have yet.

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
  web/                  React + Vite client              (@repo/web)
  api/                  NestJS REST API                  (@repo/api)
    src/modules/schedule/engine/   The pure CPM/GPM engine
packages/
  config/               Shared ESLint + tsconfig         (@repo/config)
  types/                Shared cross-boundary types      (@repo/types)
  interchange/          XER/MSPDI canonical model        (@repo/interchange)
  engine-conformance/   Engine-free conformance fixture  (@repo/engine-conformance)
docs/                   Architecture, guides, ADRs, roadmap
scripts/                Repository automation
```

## 🚀 Quick start

**Prerequisites:** Node.js ≥ 22 (see [`.nvmrc`](.nvmrc)), pnpm ≥ 10 (via
`corepack enable`), and Docker (for local PostgreSQL).

```bash
# 1. Clone and enter
git clone https://github.com/HuttonHomeHub/SchedulePoint_1.git && cd SchedulePoint_1

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
| [`docs/PROJECT_BRIEF.md`](docs/PROJECT_BRIEF.md)                 | What SchedulePoint is: vision and scope    |
| [`CLAUDE.md`](CLAUDE.md)                                         | Project operating manual (source of truth) |
| [`docs/PROCESS.md`](docs/PROCESS.md)                             | How features go from idea to shipped       |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)                   | System design and boundaries               |
| [`docs/FRONTEND_ARCHITECTURE.md`](docs/FRONTEND_ARCHITECTURE.md) | Frontend architecture & patterns           |
| [`docs/BACKEND_ARCHITECTURE.md`](docs/BACKEND_ARCHITECTURE.md)   | Backend architecture & patterns            |
| [`docs/DATABASE.md`](docs/DATABASE.md)                           | Database standards & philosophy            |
| [`docs/SECURITY_STANDARDS.md`](docs/SECURITY_STANDARDS.md)       | Security engineering standards             |
| [`docs/OBSERVABILITY.md`](docs/OBSERVABILITY.md)                 | Logging, metrics, tracing, health          |
| [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md)                     | Performance & scalability standards        |
| [`docs/REFERENCE_FEATURE.md`](docs/REFERENCE_FEATURE.md)         | The backend implementation standard        |
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

[MIT](LICENSE) © The SchedulePoint authors
