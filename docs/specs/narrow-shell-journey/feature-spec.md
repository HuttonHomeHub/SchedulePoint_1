# Feature Spec — the narrow-shell journey (`docs/TECH_DEBT.md` #172)

**Status:** Approved with the correctness programme (product owner, 2026-08-28: "polish, improve
and ensure features are correct rather than new features" — #172 is Phase 2's first row).
**Author:** correctness programme, Phase 2. **ADR-0105 trigger:** a new Playwright config and CI
step — which is why this spec exists before the journey does.

## 1. Business understanding

`docs/TECH_DEBT.md` #172, measured: **no authenticated journey has ever driven the app below
`lg` (1024 px)**. Every `playwright.*.config.ts` that sets a viewport sets 1440 px or wider; the
rest inherit Playwright's 1280 default. The only narrow-viewport suite is `e2e-public`, whose
subject is the six unauthenticated screens. What that leaves untested is live code with explicit
breakpoint branches:

- the off-canvas `Sheet` that IS the Project Explorer below `lg`, and the header hamburger that
  opens it — a whole navigation surface no browser has ever opened;
- `app-header.tsx`'s below-`lg` row (second `BrandLink`, org switcher, account chip);
- every `hidden lg:flex` / `lg:hidden` branch in the shell, including the drawer column;
- the `useMediaQuery(LG_QUERY)` transition effect that closes the sheet on crossing the
  breakpoint;
- the workspace's `hostsDock` below-`md` behaviour that ADR-0114 M7's gate pass found broken
  (the plan's facts, `Recalculate` and the pen status vanishing below `md`) — found by a
  specialist review because **no journey could have found it**; this journey is the instrument
  that class of defect was missing.

The row was originally "filed, deliberately not scheduled" (the product owner works at 1646 px).
The correctness programme scheduled it: the risk is not the PO's own screen but the class of
defect that ships green because nothing ever runs the branch (#168 was found by _reading_, which
is not repeatable).

## 2. Functional requirements

The journey proves, in a real browser at a narrow viewport, that the authenticated shell's
narrow half **works**, not merely renders:

- **FR-1 (navigate):** below `lg`, a signed-in user can open the Project Explorer via the header
  trigger, see the hierarchy, and navigate to a plan; the sheet closes after navigation and
  focus lands somewhere sensible (not `<body>`).
- **FR-2 (header):** the below-`lg` header row carries the brand link, org switcher and account
  chip, and each is pointer-reachable (not clipped by an `overflow-hidden` ancestor — the #196
  `elementFromPoint` lesson: a control that is not painted looks exactly like one that does not
  exist).
- **FR-3 (breakpoint crossing):** with the sheet open, widening the viewport across `lg` closes
  it (the `useMediaQuery` transition effect) and the pinned rail takes over; narrowing back
  restores the trigger.
- **FR-4 (workspace foot):** below `md`, the plan's facts and `Recalculate` are still reachable
  (the ADR-0114 M7 regression's journey-level pin — its unit pin exists, this is the browser
  half).
- **FR-5 (a11y smoke):** an axe scan of the shell with the sheet open at the narrow viewport
  (scoped include; wcag2a/wcag2aa tags, matching the estate's convention).

## 3. Technical analysis

- **Viewports:** 390 × 844 (a phone, well under `md`) and 800 × 900 (between `md` 768 and `lg`
  1024 — the tablet-portrait band where the sheet exists but `md:` branches are on). FR-3 uses
  `page.setViewportSize` to cross 1024 in both directions in one test.
- **Pointer stays fine** (Playwright default): #133 owns the coarse-pointer question, and mixing
  the two axes in one new suite would blur which failure means what. The config records this in
  its docblock.
- **Seeding:** the suite reuses the base journey's helper (sign-up → org → client/project/plan
  through the UI or API helper, whichever the estate convention is — read `apps/web/e2e/`'s
  helpers, do not invent a second seeding path).
- **What it deliberately does not cover:** the TSLD canvas's own narrow behaviour (the canvas
  suites own the canvas), the unauthenticated screens (`e2e-public` owns them), coarse-pointer
  target sizing (#133).

## 4. Solution design

One new suite `apps/web/e2e-narrow-shell/narrow-shell.spec.ts` with
`playwright.narrow-shell.config.ts` (viewport 390 × 844 as the project default; the FR-3 test
sets its own sizes), a `test:e2e:narrow-shell` script, an entry in `scripts/e2e-local.sh`'s
derived list, and its own CI step in the workflow where the other flag-on suites run — the
ADR-0081 shape: the journey IS the deliverable, since the capability (the narrow shell) already
ships.

## 5. Risks

- The sheet may genuinely be broken (it has never run) — that is the point; failures here are
  findings, triaged as Phase-2 fixes, not test bugs to spec around.
- Below-`lg` assertions are layout-sensitive; locate by role+name, never by geometry, except
  where the assertion IS geometric (FR-2's `elementFromPoint` reachability).
