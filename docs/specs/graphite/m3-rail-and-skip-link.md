# Graphite M3 — the rail takes the leading edge, the top bar goes

**Date:** 2026-08-20 · **ADR:** [ADR-0099](../../adr/0099-graphite-the-workstation-in-rail-chrome.md) D1

## What landed

1. **The Project Explorer rail spans every grid row.** It is the leading edge top to bottom, which
   is what F0 needs: the Gantt's activity grid starts 46 px in rather than 224–420 px behind a
   properties panel.
2. **The top bar is deleted at `lg`+.** The brand link, the organisation switcher and the account
   menu move into the rail — into a new identity zone at its head and an account zone at its foot —
   and survive a rail **collapse**, which is the half that is easy to get wrong.
3. **A skip link**, the first focusable element in the document and the only one this repository has
   ever had.
4. **The plan identity line merges into the mode row**, because measurement said the milestone was
   otherwise worth 12 px.

## The measurement that changed the milestone

M3's first shape deleted the 56 px header and gave the identity line a 44 px row of its own inside
the band, because the row it had been merged into (ADR-0097 D1b) no longer existed. Measured with
`pnpm measure:toolbar vertical-stack`, before and after, on the same populated plan with the pen
held:

| Width     | `aboveCanvas` before | first shape | shipped | canvas before → shipped |
| --------- | -------------------- | ----------- | ------- | ----------------------- |
| 1920×1080 | 240                  | 228         | **184** | 559 → **615**           |
| 1646×1097 | 240                  | 228         | **184** | 576 → **632** (+9.7 %)  |
| 1440×960  | 240                  | 228         | **184** | 439 → **495**           |
| 1280×900  | not measured before  | —           | **184** | — → 435                 |

**Deleting a 56 px bar bought 12 px.** That is ADR-0092 M4's finding verbatim — "relocating a row
inside one column removes nothing" — happening to the milestone that quotes it, and it would have
shipped as a 56 px headline had the harness not been run both ways. The identity line therefore
moves into the **mode row**, whose only other occupants are four mode buttons and the pen status.

That merge was attempted once before and withdrawn: ADR-0091's retrospective records the identity
wanting ~1170 px against ~861 px available at 1280 **in the header**, which also carried the brand,
the switcher and the account. None of those are in the mode row, which is the whole reason this
fits where that did not. Verified at 1280 rather than argued: the `e2e-toolbar-fit` gate passes at
every targeted width with no mode item demoted, which is the condition — an armed mode behind a `⋯`
is the ADR-0064 dead end.

With the line merged, the `identity` chrome slot has nothing to carry: the identity and the modes
are now rendered by the same component, so the portal that crossed the shell boundary is deleted
along with `ChromeSlotName`'s second member and `TestChromeHost`'s second slot.

## Two harnesses were wrong, and both said so by failing

- **`vertical-stack.spec.ts` located the chrome band by `position: sticky`.** Graphite M2 removed
  that: the shell is one grid that is exactly the viewport, with `<main>` as the scroller, so
  nothing needs to stick to a document that does not scroll. The harness's own rule — a band it
  cannot find **throws** — is what surfaced it, and that rule exists because the identity row went
  missing for the whole of ADR-0090 M5 behind a silent `.filter()`. It now finds the band by
  `[data-surface="chrome"]`, the seam the scope actually stamps.
- **`e2e-toolbar-fit` S11 keyed a density expectation to the VIEWPORT width.** The band stopped
  being the viewport when the rail took the leading column: it is now viewport minus rail, which at
  1280 with the rail expanded is ~1000 px — one side of the 1024 threshold, so the gate went red
  against a ladder behaving exactly as designed. Comparing a density decision against a number the
  decision is not a function of is ADR-0091 M7's conflation, on the gate's side of the fence this
  time. S11 now reads `state.containerWidth` and reports both numbers when it fails.

## What the collapse rule cost, and why it is not a compromise

`OrgDestinationsCollapsed` exists because ADR-0097 Landing D1 moved six destinations out of a header
that survived a rail collapse; leaving the collapsed rail as one button would have put the whole
secondary navigation behind a toggle it had never been behind. M3 moves three more things out of
that same header, so the same rule applies to all three — the collapsed rail carries the brand tile,
the switcher and the account menu.

The switcher stays a native `<select>` at 36 px. Its visible text truncates and its popup does not;
it keeps full keyboard and screen-reader operation with the accessible name it already had
("Active organisation"), and a `title` carries the current organisation for a pointer user, who is
the only reader the truncation costs anything. `BrandMark` gains a `variant="tile"` for the same
width — a variant and not an `iconOnly` boolean, because the next state this needs is a third
presentation and a boolean cannot express one.

## The skip link, and the part that is easy to ship broken

`apps/web/src` contained **no** skip link at all, and did not obviously need one while the header
came first: a keyboard user reached the page in three stops. The rail now owns the leading column,
so the traversal is brand → switcher → New client → collapse → a `tree` of every client, project and
plan in the organisation → six destinations → the account menu, before any of the thirteen authed
routes' content. That is WCAG 2.4.1 Bypass Blocks.

The DOM order is the visual order — the rail's top-left corner is the document's and the band starts
46 px in — so nothing uses `order:`, `row-reverse` or `direction: rtl`, each of which decouples
focus from reading (plan.md §A4).

Two things are asserted rather than one, because each fails alone and neither failure is visible:

- a link that is **not first** bypasses nothing;
- a target with no `tabIndex` **scrolls without moving focus**, so the next Tab resumes inside the
  rail — the link appears to work and changes nothing.

The second was verified red: removing `tabIndex={-1}` fails the case.

## Gates run

`pnpm lint` · `pnpm typecheck` · `pnpm test` (4,823 web + API) · `scripts/e2e-local.sh web`
(17 passed) · `scripts/e2e-local.sh web:toolbar-fit` (5 passed) · `scripts/e2e-sweep.sh` (every
flag-on journey, because this milestone moved a layout) · `node scripts/shoot.mjs` at 1646 / 1920 / 1280.

## What the full sweep found afterwards

Two journeys failed on the shell move, and both are the "the site MOVED, it was not deleted" case
this repository already has a name for (ADR-0097 Landing D1a, recorded in `e2e-designed-ui`'s own
comments).

**`designed-ui` — the wordmark's `aria-current` site left the `chrome` scope.** D3 measures the
current-page state that axe never looks at, and its comment claimed "two sites now, in two scopes,
which is more coverage than before rather than less": the wordmark in `chrome`, the rail's current
destination in `panel`. M3 moved the wordmark into the rail, so **both sites are now `panel`** and
the two-scopes argument has collapsed. The selector is re-pointed rather than deleted — the
measurement follows the control — and the honest consequence is recorded rather than papered over:
**on the screens this suite visits, the `chrome` scope paints no current state at all.** Its only
remaining site is the breadcrumb's final crumb (`breadcrumbs.tsx:58`), which renders only inside a
plan's identity row. Extending four theme variants through a project and a plan to reach it is real
cost for one pair, so it is `docs/TECH_DEBT.md` rather than a silent gap.

**`workspace-chrome` — a drag that leaves the canvas.** See `m4-context-drawer.md`; the fix belongs
with the drawer that narrowed the stage.
