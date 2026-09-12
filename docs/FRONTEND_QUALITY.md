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

- **The budget is enforced, and it is the measured floor plus 5%** — not the
  ~200 kB figure this section carried for years, which predates any build being
  looked at. `apps/web/bundle-budget.json` holds the numbers and
  `pnpm --filter @repo/web check:bundle-size` compares them to a real artefact on
  every CI run (`docs/specs/delivery-gates/` M3). ADR-0058: a bar set at an
  aspiration gets deleted rather than met.
- **The quantity is the entry GRAPH, not the entry chunk, and the difference is
  33 kB.** The graph is the entry chunk plus the transitive closure of its
  **static** imports — everything the browser must parse before it can render.
  Measured 2026-09-11 by `pnpm --filter @repo/web build`, which now writes
  `apps/web/bundle-report.json`. **In bytes, because that is what
  `bundle-budget.json` holds and what the gate compares**: entry chunk 370,899
  gzip, `paint` 33,477, the Rolldown runtime 368 — **404,744 for the graph**,
  from 1,393,464 raw. CSS is a further 15,144 gzip from 84,285 raw. So recording
  the entry chunk alone as "the initial bundle" understates first paint by
  **33,845 bytes**, the `paint` chunk it statically imports.
- **The figure this section carried on 2026-09-10 (372.42 kB) is NOT comparable
  with the one above, and saying so is the correction.** It came from Vite's own
  build reporter, which prints kB = 1000 bytes; these come from
  `bundle-report-plugin.ts`. An earlier version of this bullet compared the two
  as if they were one measurement. Gzip level was checked and is not the cause
  (level 9 moves these assets ~0.2%), and `pnpm-lock.yaml` is untouched between
  the two dates, so the vendor chunks did not change. **Quote bytes here**, and
  compare like with like or not at all. _The two figures in the next bullet were
  KiB under a `kB` label until 2026-09-12 — this rule failing two lines below
  itself. `check:bundle-size`'s own output does the same (it prints
  `395.31 kB` for 404,797 bytes, i.e. bytes/1024), which is the third convention
  in circulation and the one a reader trusts most; it is `docs/TECH_DEBT.md`
  #292's units paragraph arriving inside the gate._
- **`jspdf` (128,584 bytes gzip) and `html2canvas` (46,603) are confirmed OUTSIDE
  the entry graph** — verified from Rollup's own static/dynamic import lists
  rather than inferred from chunk names, which cannot say which kind an import
  was. They cost the first paint nothing.
- The remaining gap to any aspirational figure is explained by the bullet below
  on code splitting rather than by anything being oversized: every authenticated
  route is in the entry chunk (`docs/TECH_DEBT.md` #292).
- Prefer platform APIs and small libraries; **justify every new dependency**
  (size, maintenance, tree-shakeability) in the PR.
- Import icons and utilities by name (tree-shakeable); never import whole
  libraries for one function.
- Watch for duplicate/transitive bloat; analyse the bundle when adding deps.

## Code splitting & lazy loading

- **Route-based splitting is the INTENTION, and is not what the app does today.**
  This line read "route-based splitting by default — each route is its own chunk"
  until 2026-09-10, when it was measured. `app/router.tsx` declares 26 routes and
  has **two** `lazy()` boundaries — `/share` and `/staff` — and `vite.config.ts`
  sets no `manualChunks`. A production build emits **10 JS chunks**, of which two
  are route chunks (`share` at 0.30 kB gzip, being only the wrapper, and `staff`
  at 23.84 kB); the rest are library splits that Rolldown derived from the two
  dynamic imports. **Every authenticated route — the whole plan workspace — is in
  the entry chunk.** Aim for the rule above when adding a route; do not read it as
  a description of the present.
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
