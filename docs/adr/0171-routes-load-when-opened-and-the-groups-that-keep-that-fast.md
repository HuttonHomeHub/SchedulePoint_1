# ADR-0171: Routes load when they are opened, and the chunk groups that keep that fast

- **Status:** Accepted
- **Date:** 2026-10-02
- **Deciders:** James Ewbank (product owner — CQ-1 lazy shell; CQ-2 10% deep link / 5% in-app, and on
  2026-10-02 the measured outcome below accepted with the refresh limb as a recorded trade; CQ-4
  container readings only), with Claude Code
- **Builds on:** ADR-0029 (the persistent shell), ADR-0136 (the bundle gate), ADR-0160 (the gate runs
  in prepush), ADR-0108 (the `beforeunload` guard), ADR-0110 D5 (a gate is verified against its
  defect)
- **Spec:** [`docs/specs/route-code-splitting/`](../specs/route-code-splitting/feature-spec.md);
  closes `docs/TECH_DEBT.md` #292

## Context

Until this change `app/router.tsx` had two lazy routes of twenty-two, so a visitor to the sign-in form
downloaded the whole authenticated application: an entry graph of **461,186 gzip bytes** on
2026-10-02 (`d3b9dbf`), 55,647 of it the TSLD painter. #292 recorded that and warned that splitting
"is the obvious remedy and is **not** obviously right": a shell shared by every route can move 300 kB
out of the entry and fetch it again on the first navigation.

Measured in the build container (`m0-measurement.md`, throttled to 1.6 Mbps and 150 ms RTT, seven
runs per path, the median reported), the first split (M3) regressed plan opening by 32% on a cold deep link, 91% in the app and 140% on a
refresh (medians 4,711, 4,091 and 2,873 ms). The cause
was not bytes. It was request count under HTTP/1.1's six connections per origin: the plan screen's
static graph was 37 chunks, most under 1 kB, and `/api/v1/me`, issued in the same wave, queued behind
them for 977 ms.

## Decision

- **D1 — Every screen is lazy unless it is the sign-in screen.** `lazyRouteComponent` for all of them,
  `/share` and `/staff` keeping their existing `lazy()`. `SignInScreen` is the one allow-listed eager
  route, with its reason (2,835 gzip bytes; the page every cold visit redirects to), in
  `router-splitting.structural.test.ts`'s `EAGER_ROUTES`. A new route is split, or is listed there
  with a reason; S1a fails otherwise. The app frame (`authed-layout`) is lazy too (CQ-1): a visitor who
  never signs in does not download it.
- **D2 — One pending treatment, and the library's timing.** `RoutePending` (the Skeleton material in the
  page frame, no landmark of its own) is the router's `defaultPendingComponent`. The router waits
  `defaultPendingMs` 1000 before showing it and keeps it `defaultPendingMinMs` 500, so a navigation
  under a second never flashes it; `router.tsx` sets neither and a test fails if it does. Its status
  line mounts empty and is filled after mount, because a live region inserted already full is
  commonly not announced.
- **D3 — Two chunk groups, and a gate on the cycle they can cause.** `vite.config.ts` declares `boot`
  (everything the entry already reaches stays in the entry) and `ui-shared` (the leaf layers: UI
  primitives, breadcrumbs and chrome, `lib`, hooks, lucide icons and the hierarchy features the plan
  screen imports), anchored to `apps/web/src` so a dependency's `src/lib` cannot match it, and holding no
  staff endpoint code except `staff-identity`, which the account chip needs. This took the plan's static
  graph from 37 chunks to 4. `entriesAware` grouping and `maxSize` splitting emit **chunk cycles**
  whose evaluation order broke the page on 3 of 8 loads, so **B9** in `check-bundle-size.mjs` reads the
  emitted chunks in `dist/assets`, follows their static imports, and fails on any strongly connected
  component larger than one, naming the chunks. Rejected: `strictExecutionOrder` (pulls the application
  into the entry, 509 KiB gzip against a 185 KiB budget); adding `components/layout` or plan-private
  features to `ui-shared` (one 260 kB chunk).
- **D4 — Warm what the user is likely to open next, once, when idle.** After the session is known,
  `warmHierarchyScreens` preloads the organisation, client and project screens and the plan screen,
  once per document, from a `requestIdleCallback` (timer fallback) so it never competes with the route
  that was opened. A document opened on a plan URL starts fetching the frame and the plan screen at
  boot and skips the hierarchy warm-up. `defaultPreload: 'intent'` covers links.
- **D5 — A chunk that will not download offers a reload, not a retry.** `lazyRouteComponent` reloads the
  page once itself (`lazyRouteComponent.js:37-44`, a `sessionStorage` marker keyed by the error
  message) and thereafter rethrows. `RouteErrorScreen`'s button then reloads the page, through the
  same `window.location.reload()`, so ADR-0108's `beforeunload` guard applies; while
  `navigator.onLine` is false it says "You appear to be offline. Reconnect, then try again." and
  does not reload. Its heading takes focus on mount. Every other failure keeps `reset()` plus
  `router.invalidate()` (#314).
- **D6 — `index.html` is never cached.** `nginx.conf` serves it `expires -1` (`Cache-Control: no-cache`)
  while `/assets/` stays immutable. `expires`, not `add_header`: an `add_header` inside a location
  replaces every header inherited from `server`, which would strip the CSP from the document.
- **D7 — The budget is re-floored downward, once, by exception.** `bundle-budget.json`'s rule is that a
  floor is measured at `origin/main`, so that a raise cannot be hidden inside the change that needs it.
  A split that shrinks the graph cannot be measured against a `main` that still holds the unsplit one, so
  the epic re-floors at its own head, **for lowerings only**, and `measuredBy` says so. B8b (the ratchet)
  then fails any later build whose graph plus headroom is under the floor, so the lowered number cannot
  decay into slack.

## Outcome against the spec's thresholds (CQ-2)

Container medians, `readyMs`, the same machine and harness; "before" is the pre-split build.

| path                    | before | final | change | limit |
| ----------------------- | ------ | ----- | ------ | ----- |
| sign-in, cold           | 2,797  | 1,398 | -50%   | none  |
| plan deep link, cold    | 3,577  | 3,874 | +8.3%  | 10%   |
| plan opened in the app  | 2,146  | 2,251 | +4.9%  | 5%    |
| plan deep link, refresh | 1,199  | 1,403 | +17.0% | 10%   |

The entry graph fell from 461,186 to **176,749** gzip bytes (two chunks); CSS is 16,256; the largest lazy
chunk is `jspdf` at 128,581. **CQ-2 is partially met; the refresh limb is accepted by the product owner
(2026-10-02).** The in-app figure sits inside its limit but is indeterminate: its run-to-run spread is
wider than the margin. The refresh figure was taken through `vite preview`, which revalidates every
hashed chunk on a reload; nginx serves `/assets/` immutable, so the deployed cost is expected to be
lower, and that is **not measured** — `docs/TECH_DEBT.md` #433 owns it.

## Consequences

- A reader of a screen they open pays for it when they open it, behind a skeleton after one second.
- The plan screen is five requests (frame, screen, shared, canvas, painter) rather than one entry.
- Chunk grouping is now a configuration with a gate behind it. Adding a directory to `ui-shared` is
  a measurable change, not a tidy-up.
- Corrected claims, recorded because the epic's own documents made them: the spec's "the router
  already reloads once" was true and is now cited; the first plan said the ceiling was likely to
  rise and it did not; #292's "26 routes" was 22 screens.
