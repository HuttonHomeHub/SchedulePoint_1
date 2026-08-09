# @repo/web

The SchedulePoint web client: **React 19 + TypeScript + Vite**, styled with **Tailwind CSS v4**
and **hand-rolled WAI-ARIA APG primitives**, using **Lucide** icons.

> **Status:** built and shipping — a Canvas-2D TSLD workspace, a virtualized Gantt view, and a
> flag-scoped Playwright suite per feature beside the base journey. **The counts live in one place,
> and it is not here:** `CLAUDE.md`'s stage banner, re-derived and gated by `pnpm check:counts`
> (ADR-0076). This paragraph used to restate them and was wrong about three of four five days after
> saying "counted 2026-08-04" — 27 modules against 28, ~750 source files against 893, 23 suites
> against 29. A second, ungated copy of a number is a claim with nothing watching it, which is the
> whole reason that gate exists; and the two counting methods do not even agree with each other,
> so a corrected copy would have had to pick one silently. The **architecture** is defined in
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
  features/         # Feature modules (components, api, hooks, model, schemas)
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
