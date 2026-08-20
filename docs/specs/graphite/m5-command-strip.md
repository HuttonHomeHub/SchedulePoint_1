# Graphite M5 — the single command strip, as built

**Status:** landed 2026-08-20 · **ADR:**
[ADR-0099](../../adr/0099-graphite-the-workstation-in-rail-chrome.md) D3 ·
**Preceded by** [`m5-design.md`](m5-design.md) (the shape, and the three outcomes written down
first) and [`m5-t1-measurement.md`](m5-t1-measurement.md) (which chose outcome 3).

## What shipped, against what was designed

| `m5-design.md` said                                            | Shipped                                                                          |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `ToolbarRow` `'mode' \| 'look' \| 'do'` → `'mode' \| 'strip'`  | yes — `splitByRow` still seeds every key, so a union change is a typecheck error |
| The four mode segments move to the rail                        | yes — via `ChromePortal name="rail"`, `orientation="vertical"`                   |
| `search` stays an inline field at full width                   | yes                                                                              |
| The ladder, band floors, hysteresis, `CHROME_RESIDUAL_PX`, `⋯` | **kept.** M5-T1 chose outcome 3; ADR-0099's Consequences were struck in place    |

The last row is the milestone's central fact. ADR-0099 asserted those five mechanisms "become
unnecessary and are deleted with the row they served"; the measurement said the reduced strip does
not fit at 1280, so the ADR was corrected and the mechanisms stay. **The measurement was not
re-read until it agreed with the plan** — that is the fifth consecutive epic in this register whose
width expectation its own instrument contradicted, and the fourth in the same direction.

## The vertical win, measured

`pnpm measure:toolbar vertical-stack` → `apps/web/measure-output/m4-vertical-stack.json`.

| Band                 | Before Graphite | After M3 | **After M5** |
| -------------------- | --------------: | -------: | -----------: |
| `aboveCanvas`        |             240 |      184 |      **135** |
| canvas height @ 1646 |             576 |      632 |      **681** |

**+18 % of diagram** at the width this work is judged on, and `aboveCanvas` is now three bands
(87 px of shell chrome, a 28 px identity row, a 44 px strip inside an 86 px command band) where it
was five.

## Three things the milestone found that nobody was looking for

### 1 · The floor moved, and it is a cost of the merge rather than a defect

`e2e-toolbar-fit`'s `PINNED_FLOOR_WIDTH` rises **768 → 960**. ADR-0090 M3 earned 768 by removing
pinned items from Row 1, and the pinned load it left behind was **split across two rows**; one row
makes it additive. Instrumented at 768, the ladder had already demoted **all twelve** demotable
commands into the `⋯`, and the eleven surviving `render` items sum **720 px** against a **752 px**
container that also owes 40 px of gaps, 81 px of chrome and 41 px of `⋯`. The row laid out at 866.

A `render` item is pinned because it paints bespoke chrome and therefore has no `menuitem` form to
demote **into** — a sound rule, not an oversight, which is why the answer is a recorded floor and
not a hack. Corroborated independently by `graphite-strip.json`: `fits: false` at 768, `fits: true`
from 960 up. Full record, with the two candidate narrowings and what each is worth, is
`docs/TECH_DEBT.md` #147.

### 2 · The first fix was inert, and its comment asserted a measurement that was false

The obvious 114 px was `recalculate`'s `showLabel: 'always'` (~110 px of label, justified in its own
comment by TECH_DEBT #61). It was narrowed to `{ atLeast: 'condensed' }`, the gate re-run — and
returned **exactly 866 again**. The ladder probe explains it: `recalculate` has been inside the `⋯`
at _every_ width in the gate's list for the whole epic, so pinning its label cost nothing and
releasing it bought nothing.

Reverted rather than kept as harmless, because the comment written with it claimed "measured 113 px
over its container at 768 with the label pinned" — a decision-bearing sentence that was false
(ADR-0076 Class 3). **The identical number is what exposed it**; a change that helps a little would
have shipped.

### 3 · The gate was measuring ordering in two frames of reference

Raising the floor unmasked a **latent instrument bug**, which S4 had been failing before and
therefore hiding. S9 ("the `⋯` is the row's rightmost control") compared `getBoundingClientRect`
values gathered _inside_ the reachability sweep — and that sweep calls `scrollIntoView` on every
item, which is its entire purpose. Once the row genuinely scrolled, scrolling `export` into view
shifted the `⋯` 73 px left before its box was read, so the button that really ends the row measured
a smaller `right` than its neighbour and S9 reported `export`. **The product was correct
throughout.**

Invisible until now because the row had never overflowed at any width in `WIDTHS`, so every
`scrollIntoView` was a no-op and every box happened to be read at the same offset. `readRow` is now
two passes — ordering at one fixed scroll position, then reachability, which may scroll freely.

## The regression the journey found, which no unit suite could

`e2e-workspace-chrome/conflict-review.spec.ts` runs at **1646**, and it failed on
`[data-toolbar-item="next-conflict"]` not being on the row.

That is ADR-0094 M2's finding arriving back one epic later without anyone deciding it: _a control
shaded "No conflicts to review" inside a menu is a shading nobody sees._ The cause is the merge.
`next-conflict` carried `priority: 90` — "navigation still survives longest (ADR-0090 D3)" — and
that rule was about **Row 1**, where the only thing this command could displace was a viewport
button. Merged, the viewport cluster (priority 100) and this command compete on one budget, and the
ladder kept `Zoom out`.

Raised to **110**, and the trade is deliberate and asymmetric: zooming out survives the `⋯` intact
(`View ▾ ▸ Zoom`, and Ctrl+scroll), while `Next conflict` has no second route and its whole value is
a shaded state and a count that must be seen **without opening anything**. The read-out still cannot
take the lower rank instead — it has no rank, which is the asymmetry that caused this originally.

## The second regression, and the field that had never been a ranking

The sweep's first three suites found `Recalculate` **unreachable without opening the `⋯`** —
`e2e-edit` and `e2e-toolbar` both timing out on `getByRole('button', { name: 'Recalculate' })`
within minutes of each other, at the ordinary 1280 viewport. The ladder probe showed it in the
overflow at **every width from 768 to 2133**, behind `Legend` and `Resource view`.

The cause is one line that had never meant anything: `priority` defaults to **`-order`**, so this
command's rank was **−7 because it registered eighth**. On ADR-0031's two rows that was harmless —
Row 2 had room for the whole authoring cluster, so an unranked field is indistinguishable from a
ranked one, and nobody had reason to look. **Merging the rows turns the artefact into a decision
about what a planner can reach.** The same sentence explains `next-conflict` above; these are two
instances of one property of the merge, not two coincidences.

Ranked at **95** — above the lenses at 60 and the whole authoring tail, below the viewport cluster
at 100 and `next-conflict` at 110 — on two grounds. It is the command that makes the diagram **true**
after an edit, and its spinning icon is the only visible cue in the product that a recalculation is
running at all. A command inside a menu cannot spin at anybody. M7 re-homes the running state to the
status bar, and the docblock says to re-read the rank when it does, because the second ground goes
with it.

**The sweep was stopped and restarted rather than left to finish.** A sweep measures the tree it
runs against; twenty-nine more suites against a tree already known to be wrong buys nothing and
costs ninety minutes.

## A third site, and a correction to my own first account of it

Three suites located the toolbar by **selector string** rather than by role+name, and my rename had
updated only the `getByRole` sites:

```
e2e-loe/loe.spec.ts:57            .include('[role="toolbar"][aria-label="Build and manage"]')
e2e-undo/undo.spec.ts:64          .include('[role="toolbar"][aria-label="Build and manage"]')
e2e-resource-view/…:128           .include('[role="toolbar"][aria-label="View and navigate"]')
```

These are **axe scan includes**, and I first wrote this section up as "a scan matching nothing scans
nothing — green for having tested nothing", which is `docs/TECH_DEBT.md` #124's shape and the
failure mode this register records most often. **Then I opened the dependency, and it is the
opposite.** `axe-core`'s `validateContext` (`axe.js:19178-19183`) throws
`No elements found for include in page Context` when the include resolves to nothing, so all three
would have gone **red**, loudly, on their next run — a breakage rather than a hole. (`axe-core`
**4.12.1**, which is what `@axe-core/playwright@^4.13.0` actually resolves to here — established by
`pnpm check:claims` refusing the version I had assumed, which is the gate doing precisely its job.)

Recorded rather than quietly rewritten, because the mistake is instructive in a way the fix is not:
I reached for the shape this repository has taught me to expect instead of reading the code, which
is ADR-0076 Class 2 (a claim about a dependency's internals) committed in the same document where I
was congratulating an instrument for catching one. The citation is now registered in
`scripts/dependency-claims.json`, so `pnpm check:claims` fails if an axe bump moves it.

What survives of the original point is smaller and still worth having: **a `grep` is scoped by
whichever spellings you remember**, and these were a different spelling of the same thing. They were
found by a `grep -rn 'aria-label="View and navigate"'` run _because_ the sweep was about to run, not
by the sweep itself — the sweep's contribution here was the prompt, not the catch.

## Gates run

`pnpm lint` · `pnpm typecheck` · `pnpm test` (518 files / 4818 tests) ·
`scripts/e2e-local.sh web:toolbar-fit` (6/6) · `scripts/e2e-local.sh web:workspace-chrome` (6/6) ·
`pnpm measure:toolbar vertical-stack` · `pnpm measure:toolbar graphite-strip` ·
`node scripts/shoot.mjs --width 1646` · the full 33-suite sweep.

## Carried into M9

The 1646 screenshot shows the **`Data date` flag overlapping lane 0's bar**. It is not caused by
this milestone — the marker is painted at the top of the scene and the lane packer starts there —
but M9 owns `sceneTopOffset` being _re-derived rather than re-assumed_, and this is the state to
re-derive it against.
