# Frontend Quality Standards

> The non-negotiable quality bar for `apps/web`. These are merge requirements,
> enforced by CI, reviewers, and the specialised agents in `.claude/agents/`.

## Testing

- **Component/unit** with Vitest + Testing Library; query by role/label, assert
  behaviour (see [`TESTING.md`](TESTING.md) and
  [`COMPONENT_LIBRARY.md`](COMPONENT_LIBRARY.md)).
- **Hooks** tested in isolation; **data hooks** tested with a mocked API layer.
- **End-to-end** (Playwright) for critical journeys, including automated
  accessibility assertions.
- **Coverage:** ≥ 80% on changed code; no regressions; every bug fix ships a
  failing-first regression test.
- No `.only`, no skipped tests committed; tests are deterministic (no real time,
  network, or randomness without control).

## Accessibility

- **WCAG 2.2 AA** is a merge requirement (full checklist in
  [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md)).
- `eslint-plugin-jsx-a11y` runs in CI; violations fail the build.
- Automated a11y checks (e.g. `axe`) run in Playwright journeys for key screens.
- Manual keyboard + screen-reader pass for any non-trivial UI; the
  **Accessibility Reviewer** agent audits it.

## Performance

Targets (align with `CLAUDE.md` §15; re-baseline with real data):

- **Core Web Vitals in "good":** LCP < 2.5s, INP < 200ms, CLS < 0.1 on a
  mid-tier mobile over 4G.
- **No layout shift** from async content — reserve space with skeletons.
- **Interaction feedback < 100ms.**
- Measure before optimising; no un-measured performance claims. Route-level
  performance budgets tracked as they land (see [`BACKLOG.md`](BACKLOG.md)).

## Bundle size

- **Budgets:** initial (critical-path) JS ≤ ~200KB gzipped; per lazy route chunk
  ≤ ~150KB gzipped. Budgets are advisory now and become CI-enforced with the
  walking skeleton (roadmap M1).
- Prefer platform APIs and small libraries; **justify every new dependency**
  (size, maintenance, tree-shakeability) in the PR.
- Import icons and utilities by name (tree-shakeable); never import whole
  libraries for one function.
- Watch for duplicate/transitive bloat; analyse the bundle when adding deps.

## Code splitting & lazy loading

- **Route-based splitting by default** — each route is its own chunk; the app
  shell and critical path stay in the initial bundle.
- **Lazy-load heavy, non-critical UI** (charts, rich editors, rarely-used
  dialogs) behind `React.lazy`/dynamic import with a Suspense fallback.
- Prefetch likely-next routes on link hover/focus (intent-based).
- Split vendor code sensibly; keep the shared runtime lean.

## Error boundaries

- An error boundary wraps the **app root** (last-resort fallback + report) and
  **each route segment** (localised recovery so one screen's failure doesn't
  blank the app).
- Fallbacks are friendly, on-brand, and offer a retry / route home. They report
  to telemetry with context (route, user-safe error id) — never a raw stack to
  the user.
- Data errors are handled by TanStack Query states, not boundaries; boundaries
  catch render/runtime faults (see error handling in
  [`FRONTEND_ARCHITECTURE.md`](FRONTEND_ARCHITECTURE.md)).

## Telemetry

- A thin **telemetry facade** (`lib/telemetry.ts`) wraps whatever backend we
  choose, so product code depends on our API, not a vendor SDK.
- Capture: unhandled errors + error-boundary reports, route/page views, Core Web
  Vitals, and key funnel/interaction events — **named consistently**.
- **Privacy first:** no PII or sensitive values in telemetry payloads; respect
  Do-Not-Track and consent. Sampling for high-volume events.
- The concrete provider is deferred (see [`TECH_DEBT.md`](TECH_DEBT.md)); the
  facade lets us adopt one without touching product code.

## Logging

- Client logging goes through a small logger (not scattered `console.*`).
  `console.log` is disallowed by lint; `warn`/`error` are permitted
  deliberately.
- **Levels:** `error` (report), `warn` (recoverable/degraded), `debug`
  (dev-only, stripped in production builds).
- Never log secrets, tokens, or sensitive values. Include correlation context
  (route) where useful; align with the API's request correlation IDs.

## Definition of done (frontend quality)

- [ ] Lint (incl. jsx-a11y), typecheck, and tests pass
- [ ] New/changed UI has tests, incl. keyboard/a11y for interactive parts
- [ ] Accessible in light + dark, keyboard, and screen reader
- [ ] Loading/empty/error/success states covered (no layout shift)
- [ ] Route lazy-loaded; heavy deps split; no unjustified bundle growth
- [ ] Errors caught by a boundary and reported; no raw errors shown to users
- [ ] No secrets/PII in logs or telemetry
- [ ] Relevant docs updated
