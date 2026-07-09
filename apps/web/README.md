# @repo/web

The Blank App web client: **React 19 + TypeScript + Vite**, styled with **Tailwind CSS v4**
and **shadcn/ui** components, using **Lucide** icons.

> **Status:** foundation only. No application features are implemented yet.
> Entry points (`index.html`, `src/main.tsx`) and feature code land with their
> respective PRs. The **architecture** is defined in
> [`docs/FRONTEND_ARCHITECTURE.md`](../../docs/FRONTEND_ARCHITECTURE.md), the
> **design system** in [`docs/DESIGN_SYSTEM.md`](../../docs/DESIGN_SYSTEM.md)
> (tokens implemented in [`src/styles/globals.css`](src/styles/globals.css)),
> and UX/component/quality standards in the sibling docs. Read those before
> building UI.

## Structure (per `docs/FRONTEND_ARCHITECTURE.md`)

```text
src/
  main.tsx          # App entry: providers + router mount
  app/              # App-wide composition (providers, router)
  routes/           # File-based routes (TanStack Router)
  features/         # Feature modules (components, api, hooks, schemas)
  components/ui/     # Design-system primitives (shadcn/ui, owned as source)
  components/layout/ # App shell: sidebar, header, page scaffolds
  hooks/            # Shared React hooks
  lib/              # API client, query client, cn(), telemetry
  config/           # Typed runtime config (VITE_* access)
  styles/           # globals.css — design tokens (source of truth)
  test/             # Test setup and utilities
e2e/                # Playwright end-to-end specs
```

## Scripts

| Command          | Description                               |
| ---------------- | ----------------------------------------- |
| `pnpm dev`       | Start the Vite dev server (port 5173)     |
| `pnpm build`     | Type-check and produce a production build |
| `pnpm test`      | Run unit/component tests (Vitest)         |
| `pnpm test:e2e`  | Run end-to-end tests (Playwright)         |
| `pnpm lint`      | Lint with ESLint (includes jsx-a11y)      |
| `pnpm typecheck` | Type-check without emitting               |
