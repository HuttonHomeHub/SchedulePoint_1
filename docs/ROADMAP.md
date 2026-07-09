# Roadmap

> Blank App is a **base repository**, so this roadmap describes the _foundation's_
> direction, not a product. When you build a real application on top of it,
> **replace this file** with your product's roadmap and milestones.

## Purpose

Provide a clean, opinionated, production-grade starting point so a new
application can begin delivering features immediately, to a consistent quality
bar, without re-inventing tooling, architecture, or process.

## Milestones (the base)

### ✅ M0 — Foundation (current)

Engineering foundation complete: Turborepo + pnpm monorepo, strict TypeScript,
lint/format, CI/CD (quality + template-verify + e2e + CodeQL + release + image
publishing), Docker, docs, ADRs, a delivery process, specialised agents, and a
**CI-verified canonical feature template**. The API boots (config, health,
OpenAPI, Prisma, logging, guards). **No business features; the schema has no
models.**

### ⏭️ M1 — Web walking skeleton

- Web bootstrap: Vite app entry, providers, TanStack Router/Query, RHF + Zod,
  app shell + base shadcn/ui primitives per `docs/FRONTEND_ARCHITECTURE.md`.
- First end-to-end vertical slice through the pipeline; switch CI to a full
  `pnpm build` + web e2e (see `docs/TECH_DEBT.md`).

### 🔜 When you start an application

- Wire authentication into the `AuthContextService` seam (Better Auth, ADR-0003).
- Build the first real feature from the reference template
  (`docs/REFERENCE_FEATURE.md`) — it writes the first Prisma model + migration.
- Wire observability (OpenTelemetry), and add Redis / object storage only when a
  job, hot cache path, or file-upload feature needs them (ADR-0009/0010/0011).

## Guiding constraints

- Keep `main` releasable; ship thin vertical slices.
- Maintain the quality bar (tests, a11y, security, docs) on every change.
- Follow the delivery process (`docs/PROCESS.md`) for new features.
