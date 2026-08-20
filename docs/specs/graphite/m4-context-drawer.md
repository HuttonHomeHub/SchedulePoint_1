# Graphite M4 — the context drawer, and the rail that chooses its subject

**Date:** 2026-08-20 · **ADR:** [ADR-0099](../../adr/0099-graphite-the-workstation-in-rail-chrome.md) D2

## What landed

- **A context drawer** in grid column 3 — the app's single trailing panel, resizable 224–420 with a
  default of 300, persisted.
- **The tool rail is 48 px and fixed.** It carries the brand, the organisation switcher, the
  drawer's panel buttons, the six organisation destinations and the account menu.
- **The Project Explorer is a drawer subject**, not a column. The tree it used to hold is the
  drawer's first subject; the rail's Explorer button chooses it.
- **The band's width does not change when the drawer opens**, asserted in a browser and verified
  red — the milestone's exit condition and the product owner's original requirement.

## §4a answered by geometry, and the assertion that proves it

The band spans grid columns 2–3. `<main>` and the drawer are the two things inside that span, so
opening the drawer redistributes width between them and changes their container by **zero**. There
is no `ResizeObserver`, no reserved width and no way to break it without editing `grid-column` —
which is what four epics of measuring a row against its own leftover width bought (ADR-0090 →
ADR-0094).

`e2e-toolbar-fit` gains the assertion, at **three** states rather than two. Open/closed alone passes
equally against a band that reserves a fixed drawer width — a different design with the same two
readings — so the third state drags the splitter to 396 px. Each step also asserts that the **stage
moved**, or the drawer is taking width from nothing and the test is asserting that nothing happened.

Verified red: with the band on `col-start-2` alone rather than spanning 2–3, the case fails with
"the band changed width when the drawer closed".

## The drawer is a genuinely new pattern, so its protections are decisions

`Dialog` and `Sheet` are both native `<dialog>` + `showModal()`. There was **no non-modal persistent
panel in this codebase**, so the drawer inherits none of a modal's free behaviour:

- **Escape is the outermost rung of ADR-0080's existing ladder, never a new listener.** A React
  handler on the shell root — because a native listener follows the DOM tree and the toolbar is
  portalled into the chrome band, which is why `use-plan-workspace-key-scope.ts` exists in that
  shape. It defers to `event.defaultPrevented`, so an inner rung that already acted keeps its press
  and one Escape cannot take a planner's tool _and_ their drawer. It carries ADR-0079's target
  guard (an Escape typed into a field belongs to the field) and skips any open native modal, whose
  browser-level Escape still bubbles.
- **Focus never moves into the drawer on a subject change.** A selection change is one
  chain-navigation keystroke away; yanking focus on each is unusable. The canvas's existing
  `describeActivity` announcement carries the change rather than a second, competing live region.
- **The empty state is explicit** (`ContextDrawerEmpty`), never the last subject's stale data. A
  panel still showing an activity nobody has selected reads as current and is not.
- **Below `lg` the drawer is not rendered.** There it would have to overlay, and overlaying means
  modal, which `Sheet` already is — a second overlay contract is how two dismissal behaviours end
  up in one app.

## The rail's fixed width, and what it had to keep

The rail this replaces was resizable 220–480 and collapsible, because a planner could buy canvas
width back from it. At 48 px there is nothing left to buy: that width now belongs to the drawer,
which has its own splitter and its own closed state. Two collapse mechanisms on one edge is how a
reader ends up with a rail open and a panel closed and no way to tell which control did what — so
`RailResizer`, `useRailPrefs` and `NavigatorRailCollapsed` are deleted.

**48 px, not the 46 the brief drew.** `w-12` is on the sizing scale and `w-[46px]` is not;
`token-architecture.test.ts` ratchets arbitrary values down and went red on it, which is the gate
working. Two pixels is not worth an exemption from a governed axis.

Everything the rail took from the deleted header survives at that width — brand tile, switcher (a
native `<select>`, truncated visibly and not in its popup), destinations as icons, account menu.
That rule is `OrgDestinationsCollapsed`'s, one epic earlier: relocating navigation behind a toggle
it had never been behind is the failure being avoided.

## Two defects the gates found, and one they found twice

**The destinations rendered twice.** The rail carries them as icons and `NavigatorRail` carried them
as a list, so "Clients" was on screen twice in two treatments — ADR-0093's rule, and it surfaced as
a Playwright strict-mode locator resolving to two elements rather than as anything anyone saw. They
are the rail's; `NavigatorRail` renders them only as the `Sheet`'s content below `lg`, where the
rail is hidden and it _is_ the navigator.

**The drawer named its subject twice.** `ContextDrawer` renders the subject as an `<h2>` and
`NavigatorRail` still rendered a `SheetHeader title="Project Explorer"`, one line under the other.
Found by the **weight ratchet** — `font-semibold` rose by one — which is a gate for a different
thing catching a real duplication because the duplicate had to be styled.

**And the sizing ratchet had the hole the weight ratchet had already fixed.** It scanned raw text,
so a docblock explaining an arbitrary value counted as _using_ one: this milestone hit it by
documenting the `w-[46px]` it had just replaced with `w-12` — a gate going red at the moment its own
rule was being obeyed. Comments are now stripped, exactly as `weightSites` does twenty lines away,
and the ceiling is re-measured **20 → 18** rather than left where it was, which would have quietly
bought two units of slack. Fourth occurrence of a scan matching prose in this repository.

## Also recorded: the sweep that measured nothing

`scripts/e2e-sweep.sh` was started against M3 and left running while M4 was being written, so every
suite from `loe` onward failed on a half-applied edit — a missing export, then the `Surface`
nesting guard. None of it was a finding. A sweep is a measurement of a tree, and editing the tree
under it invalidates everything after the edit; it was restarted once M4 was still.

## Gates run

`pnpm lint` · `pnpm typecheck` · `pnpm test` (4,818 web + API) ·
`scripts/e2e-local.sh web:toolbar-fit` (6 passed, including the new band assertion, verified red) ·
`scripts/e2e-sweep.sh` (every flag-on journey).

## Known follow-up, found by reading rather than by a failure

**The drawer has no live clamp against the available width.** `useContextDrawerPrefs` clamps to its
static 224–420, and the grid gives column 3 `auto` — so the drawer takes its stored width whatever
is left, and the stage (`minmax(0,1fr)`) absorbs the shortfall. At 1024 the stage is
1024 − 48 − 300 = **676 px**; at 768 it is 420 px and falling.

`use-notes-panel-prefs.ts` already states the rule this is missing — "the _effective_ maximum is
additionally clamped at render against the live workspace width (reserving `CANVAS_MIN_WIDTH` for
the canvas), since the static max can exceed the available room" — and reserves 360 px. The drawer
needs the same reservation.

It is recorded here rather than fixed in M4 because a full journey sweep was already running against
this tree, and editing source under a sweep invalidates every suite after the edit — which had
already happened once in this epic. **M5 fixes it**, and the fix is the clamp, not a change to the
grid: making column 3 `minmax(0,auto)` would let the drawer shrink below its own minimum, which is a
different defect wearing the same clothes.

## The sweep's two failures, and the product defect underneath one of them

**`workspace-chrome` — three faults in one harness, none of them the drawer.** The failure read "the
drag never reached the server", and the drawer's ~300 px was the obvious suspect. It was the
trigger, not the cause:

1. `dragBarBy` moved the pointer to `box.x + from.x + dx` with no clamp. `findBarInRow` probes from
   x = 30, so a bar found in an early column plus a leftward `dx` put the **pointerup outside the
   canvas**, where the gesture is simply lost. Clamped — a drag that leaves the canvas is not a drag.
2. `placeOnDay` **threw** when the version did not move, which made one mis-aimed drag fatal to a
   helper whose entire design is aim, measure, correct. A version that does not move is an
   observation: the drop changed nothing. It is now recorded, the estimate widened, and the loop
   given its next attempt — which is what its own docblock always promised.
3. The real one. `placeOnDay` **aims from where the bar is DRAWN and succeeds on where it is
   STORED**, and for the placement this helper exists to build those are different numbers: ADR-0033
   flags a `visualStart` earlier than the network allows and never moves the bar, so the drawn day
   reaches the target while `visualStart` sits days behind. `(targetDay - from)` then rounds to zero,
   a zero-distance drag is a click, and the loop spends its remaining attempts asking for nothing.
   The trace said so in as many words — `drawn day 0 +0px -> no change`, twice.

   A third-of-a-day nudge was tried first and is recorded because it looks right and is not: it
   registers as a gesture (`+20px`) and still writes nothing, because it lands on the day the bar is
   already on and the client does not PATCH an unchanged `visualStart`. **The only way to rewrite a
   placement at the day it is drawn on is to leave that day and come back**, so the nudge is a whole
   day and the budget went 5 → 8.

`findBar`'s probe columns were a fixed list capped at 200 px, and the day→pixel scale is derived
from the canvas width at pick time (ADR-0056) — so a narrower canvas moved every bar past the last
column and it reported "no probed canvas point hit …", which reads as a missing bar rather than as a
probe that stopped looking. It now continues across the real width.

**`designed-ui` — and a live accessibility defect it had been scoped away from.** D3 measures the
`aria-current="page"` treatment axe never looks at. Its locator was `header a[aria-current="page"]`,
and M3 moved the wordmark into the rail, so it resolved to a hidden element.

Re-pointing it surfaced the real thing: **two links claimed to be the current page.** TanStack's
`Link` sets `aria-current="page"` itself whenever it considers itself active, and its default match
is a **prefix** — so `/orgs/:slug` was active on `/clients`, `/calendars` and every other org route,
alongside the rail destination that genuinely was current. A reader asking their screen reader
"where am I" got two answers. `brand-mark.tsx` now passes `activeOptions={{ exact: true }}`.

It was live from the moment the wordmark became a link (ADR-0098 M4) and **structurally invisible to
every gate**: the unit suites mock `Link`, so the router's own attribute never appears in them, and
the journey's locator was scoped to `header`, so it only ever saw one of the two. It became visible
only when M3 put the brand and the destinations in one container and a **strict-mode violation**
counted them. D3 now measures each site where it is actually current, and asserts the count is one —
because the defect is only ever visible as a count.
