# @repo/web

The SchedulePoint web client: **React 19 + TypeScript + Vite**, styled with **Tailwind CSS v4**
and **hand-rolled WAI-ARIA APG primitives**, using **Lucide** icons.

> **Status:** built and shipping. 27 feature modules under `src/features/`, ~750 source files, a
> Canvas-2D TSLD workspace, a virtualized Gantt view, and 23 flag-scoped Playwright suites beside
> the base journey (counted 2026-08-04). The **architecture** is defined in
> [`docs/FRONTEND_ARCHITECTURE.md`](../../docs/FRONTEND_ARCHITECTURE.md), the
> **design system** in [`docs/DESIGN_SYSTEM.md`](../../docs/DESIGN_SYSTEM.md)
> (tokens implemented in [`src/styles/globals.css`](src/styles/globals.css)),
> and UX/component/quality standards in the sibling docs. Read those before
> building UI.
>
> **There is no component library.** `components/ui/` is hand-rolled on semantic HTML and the
> WAI-ARIA APG — there is no Radix or shadcn/ui dependency, and adding one is an ADR-level
> decision. ADR-0006 still contains an unadopted clause saying otherwise; see its status line.

## Structure (per `docs/FRONTEND_ARCHITECTURE.md`)

```text
src/
  main.tsx          # App entry: providers + router mount
  app/              # App-wide composition (providers, router)
  routes/           # File-based routes (TanStack Router)
  features/         # 27 feature modules (components, api, hooks, model, schemas)
  components/ui/     # Design-system primitives — hand-rolled on the WAI-ARIA APG
  components/layout/ # App shell: top bar, Project Explorer rail, workspace region
  hooks/            # Shared React hooks
  lib/              # API client, query client, cn(), formatters, RBAC helpers
  config/           # Typed runtime config (VITE_* access, feature flags)
  styles/           # globals.css — design tokens (source of truth)
  test/             # Test setup and utilities
e2e/                # Base Playwright journey
e2e-<flag>/         # One suite per feature flag, each with its own playwright.<flag>.config.ts
```

## Scripts

| Command                 | Description                                         |
| ----------------------- | --------------------------------------------------- |
| `pnpm dev`              | Start the Vite dev server (port 5173)               |
| `pnpm build`            | Type-check and produce a production build           |
| `pnpm test`             | Run unit/component tests (Vitest)                   |
| `pnpm test:coverage`    | Run unit tests with the coverage ratchet (ADR-0058) |
| `pnpm test:e2e`         | Run the base end-to-end journey (Playwright)        |
| `pnpm test:e2e:<suite>` | Run one flag-scoped suite, e.g. `test:e2e:audit`    |
| `pnpm lint`             | Lint with ESLint (includes jsx-a11y)                |
| `pnpm typecheck`        | Type-check without emitting                         |

Run a flag-scoped suite through `scripts/e2e-local.sh web:<suite>` from the repo root — it brings up
the API and a database first. See [`docs/TESTING.md`](../../docs/TESTING.md) "Before you push".
