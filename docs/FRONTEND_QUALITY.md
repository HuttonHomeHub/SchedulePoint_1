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
- **Coverage:** ≥ 80% on changed code, no regressions — a **review expectation,
  not a gate**: no threshold is configured and CI does not collect coverage (see
  [`TESTING.md`](TESTING.md)). Every bug fix ships a regression test **verified
  to fail without the fix**.
- No `.only`, no skipped tests committed; tests are deterministic (no real time,
  network, or randomness without control).

## Accessibility

- **WCAG 2.2 AA** is a merge requirement (full checklist in
  [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md)).
- `eslint-plugin-jsx-a11y` runs in CI; violations fail the build.
- Automated a11y checks (e.g. `axe`) run in Playwright journeys for key screens.
- Manual keyboard + screen-reader pass for any non-trivial UI; the
  **Accessibility Reviewer** agent audits it.

### Colour-contrast gates (ADR-0055 §5)

The Corporate theme shipped with six verified contrast defects past a human review, a
component review and a green axe suite. None of those could have caught it — the class
names were correct, and the axe checks only ever scanned the **default theme in its
default surface**. So contrast is now gated by things that _compute_ rather than read:

| Gate                                               | What it catches                                                                                                                                                                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `styles/token-architecture.test.ts`                | An incomplete surface family, a `bg-chrome`-style utility leaking into the theme, a dropped `@theme inline`, a `var()` alias.                                                                                                                     |
| `styles/token-contrast.test.ts`                    | Every text pair < 4.5:1 and non-text pair < 3:1, across 3 themes × 3 surfaces × 2 flag states — including the placeholder pair (`--field` vs `--field-muted-foreground`) nobody had ever checked.                                                 |
| `pnpm --filter @repo/web test:e2e:designed-ui`     | The rendered article with the flags **off** (the rollback side): axe over **all four picker options**, plus the six named defect sites read back through `getComputedStyle` — hover and `aria-current` states included, which axe never measures. |
| `pnpm --filter @repo/web test:e2e:designed-chrome` | The same, with the flags **on** — the shipped default since 2026-07-26: the band as one surface, the tab order that follows from the portalled DOM order, and axe over the band.                                                                  |
| `surface-seams.structural.test.ts`                 | Application code hand-writing `data-surface` or reaching for `var(--chrome-*)`.                                                                                                                                                                   |
| ESLint `no-restricted-syntax` (colour literals)    | A raw `#666` / `rgb()` / `oklch()` in a `className` or `style` — invisible to both the scope mechanism and the contrast suite.                                                                                                                    |

Two habits go with them: **a new token pair is added to the contrast matrix in the same
change**, and **a soft rule is written down with its reason** (the `--border` ratio is
reported, not asserted, because WCAG 1.4.11 exempts decorative separators — an unexplained
missing assertion is how the next defect gets in).

A third habit, learned the hard way: **a reported ratio is recomputed, not quoted.**
`globals.css` once stated the rail's stand-off from the page as a hand-computed figure and
said the suite reported it. Nothing did — the suite only ever compared tokens _within_ one
resolved scope — so an edit to either fill would have drifted the number while the comment
still claimed the old one. Adjacent-surface ratios are now computed and printed every run.
And the exemption itself is narrow: it covers `--border`, a divider. It does **not** cover
`--input`, which draws the boundary of a control and is asserted at 3:1 — conflating the two
is how a 1.26:1 field outline survived in every theme.

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
  ≤ ~150KB gzipped. **These are advisory and unmeasured** — nothing in CI checks
  a bundle size, and no baseline has been recorded. Enforcing them is a backlog
  item ([`BACKLOG.md`](BACKLOG.md)); until then, do not claim a change is within
  budget without measuring it.
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

- `AppErrorBoundary` (`components/error-boundary.tsx`) wraps the **app root** in
  `app/providers.tsx` — the last-resort fallback.
- **Per-route boundaries are the standard but are not yet in place**: no route
  declares an `errorComponent`, so a render fault in one screen still blanks the
  app. Add one when touching a route that can realistically throw.
- Fallbacks are friendly, on-brand, and offer a retry / route home. They report
  to telemetry with context (route, user-safe error id) — never a raw stack to
  the user.
- Data errors are handled by TanStack Query states, not boundaries; boundaries
  catch render/runtime faults (see error handling in
  [`FRONTEND_ARCHITECTURE.md`](FRONTEND_ARCHITECTURE.md)).

## Telemetry — _not yet built_

There is **no telemetry**: no provider, and no facade (`lib/telemetry.ts` does
not exist, despite having been referenced here and in
[`FRONTEND_ARCHITECTURE.md`](FRONTEND_ARCHITECTURE.md)). Nothing reports an
error-boundary catch anywhere. The standard for when it lands:

- A thin **telemetry facade** wrapping whatever backend we choose, so product
  code depends on our API, not a vendor SDK.
- Capture: unhandled errors + error-boundary reports, route/page views, Core Web
  Vitals, and key funnel/interaction events — **named consistently**.
- **Privacy first:** no PII or sensitive values in telemetry payloads; respect
  Do-Not-Track and consent. Sampling for high-volume events.

## Logging

- `console.log` is disallowed by lint (`no-console` allows `warn`/`error`
  deliberately — `packages/config/eslint/base.js`). There is **no client logger
  abstraction**; `console.warn`/`console.error` go straight to the browser
  console and nowhere else, which is the same gap as Telemetry above.
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
- [ ] Errors caught by a boundary; no raw errors shown to users (reporting is
      not yet wired — see Telemetry)
- [ ] No secrets/PII in logs or telemetry
- [ ] Relevant docs updated
