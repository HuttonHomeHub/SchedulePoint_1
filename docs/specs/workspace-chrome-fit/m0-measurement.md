# M0 — the measurement, and one withdrawal

_Produced 2026-08-25 by `apps/web/measure-toolbar/{m0-repaired,m0-bands,m0-merged-row}.spec.ts`.
Raw artefacts in `apps/web/measure-output/`. Every figure below names the file it came from._

## The falsification conditions, restated before any number

From `feature-spec.md` §4, written before M0 ran:

1. **M3 (header merge) is WITHDRAWN** if, with the pen redundancy spent and CQ-2's cheap options
   applied, the merged row leaves **< 120 px of slack at 1440 in the worst pen state**, or if the fit
   sweep reports any overflow or unreachable control at 1440–1920.
2. **M1's direction is REVERSED** if the chosen geometry raises the deck's measured height at 1646.
   The metric is deck height and `aboveCanvas` — not the item-width total, which is an input.
3. **M2 is WITHDRAWN** if the dock-cost equality cannot be held at 0 px with the facts present, in
   both the collapsed and expanded hosts.

**Condition 1 fires. Conditions 2 and 3 do not.**

---

## Verdict 1 — M3 is withdrawn as scoped

Merged-row content, measured as **ink** at every width (`m0-merged-row.json`). These are constant —
they do not shrink with the viewport:

| constituent                   |  ink |
| ----------------------------- | ---: |
| brand mark + wordmark         |  139 |
| organisation switcher         |  192 |
| account chip                  |   43 |
| breadcrumb block              |  424 |
| mode cluster (caption + four) |  435 |
| pen furniture (chip + button) |  173 |
| gaps (5 × 16)                 |   80 |
| **fixed total, no sentence**  | 1486 |

The pen sentence is **not** one value. All eleven `LockView` strings, measured through `measureText`
in the pen element's own resolved font (`14px IBM Plex Sans`):

| state             | px  |     | state                  | px  |
| ----------------- | --- | --- | ---------------------- | --- |
| `holding`         | 147 |     | `canTakeOver`          | 260 |
| `free`            | 165 |     | `waitingForHandover`   | 302 |
| `heldByOther`     | 184 |     | `lostNotEditor`        | 320 |
| `expired`         | 203 |     | `lostTakenOver`        | 341 |
| `loading`         | 212 |     | **`heldByOtherAdmin`** | 432 |
| `incomingRequest` | 225 |     |                        |     |

Against containers of 1862 / 1588 / 1382 / 1222 at 1920 / 1646 / 1440 / 1280:

| scenario                                       | 1920 | 1646 |     1440 |     1280 |
| ---------------------------------------------- | ---: | ---: | -------: | -------: |
| as-is (`holding`, 1633)                        | +229 |  −45 |     −251 |     −411 |
| redundancy `sr-only` (1486)                    | +376 | +102 |     −104 |     −264 |
| **worst pen state (`heldByOtherAdmin`, 1918)** |  −56 | −330 | **−536** | **−696** |

**At 1440 in the worst pen state the row is 536 px short. The bar is +120 px. The condition fires.**

CQ-2's cheap options cannot close it: dropping the `MODE` caption (~50), shortening `Early mode` →
`Early` (~80) and removing the organisation switcher (192) total ~322 px against a 656 px gap.

### What this does not say

It does **not** say a one-row header is impossible. It says the row cannot carry **a pen sentence up
to 432 px wide** and still hold 1440. If the sentence leaves the row entirely in the eight states
that show one, the fixed total is 1486 at every state, and:

- 1440 needs breadcrumb truncation (424 → 320) **and** both cheap options → 1252 against 1382, **+130 px**
- 1646 → **+336 px**

That clears the bar. But it is four changes stacked, and the last one is not a width tweak — it
changes **where the pen model speaks**. Eight of the ten states are the only thing naming who holds
the lock, and three of those carry no action button at all, so the sentence cannot simply be dropped
(`resolveLockView`, verified). Moving it is a design decision and belongs to the product owner.

**Recommendation: M3 is withdrawn as scoped.** Re-scope it as "the pen sentence moves off the
identity row" and it becomes measurable again — but that is a different milestone with a different
subject, and this epic should not quietly become it.

---

## Verdict 2 — M1's direction is not reversed, and the cause was misdiagnosed twice

The complaint is caused by the **mix** of treatments, not by control height. At 1646 the deck's label
tops are **137** (inline items), **140** (group captions), **149** (stacked buttons)
(`m0-repaired.json`).

Unifying every control height to 40 px left the spread at **12 px** — so the height hypothesis is
falsified. Inlining every item takes the worst within-row spread to **3 px**.

| geometry       | deck h (1920/1646/1440) | deck h (1280) | wrap lines | worst spread | item width |
| -------------- | ----------------------: | ------------: | ---------: | -----------: | ---------: |
| today (mixed)  |                     116 |           116 |          2 |        12 px |       2089 |
| **all inline** |                 **108** |       **224** |      2 → 4 |     **3 px** |       2287 |
| all stacked    |              _unusable_ |    _unusable_ |          — |            — |          — |

Inlining **lowers** deck height at 1920/1646/1440 (−8 px), so condition 2 does not fire there. At
1280 it raises it by 108 px, because the cards wrap from two lines to four.

**The all-stacked row is deliberately empty.** That probe's numbers are self-contradictory — items
340 px narrower yet _more_ wrap lines, and the spread getting worse — because forcing
`flex-direction: column` onto split-button triggers and group captions produces a layout no
implementation would produce. Pricing that direction needs a real prototype. **CQ-1 remains open and
must not be decided from this table.**

### #185's open anomaly is resolved

That row flags the deck measuring the same height at 1920 and 1280 as suspect, since a `flex-wrap`
container should reflow. It does not reflow because its **2089 px of items fit in exactly two lines
at every width from 1280 to 1920**. The 116 px is a _wrapping_ cost, not a _stacking_ one — which is
why un-stacking, which #185 calls "the single biggest term in the height", is worth 8 px.

---

## Verdict 3 — M2 proceeds, with a mandatory fallback

**The dock guarantee holds.** Canvas height at 1646 is **715 px** with the dock empty, **715 px**
with a tool armed, and **715 px** with an activity selected (`m0-bands.json`). ADR-0092's 0 px
equality survives; condition 3 does not fire.

**The fallback is not optional.** Below the `md` breakpoint (48rem) the activities bar is **not
mounted at all** — `activitiesBarMounted: false` at 700 and 600 — while the facts cluster is present
at 465 × 24 via `[data-chrome-slot="status"]`. A literal merge into the handle row deletes the plan's
facts on exactly those screens.

| width | canvas | above canvas | activities bar  | facts    |
| ----: | -----: | -----------: | --------------- | -------- |
|  1920 |    698 |          303 | 1619 × 41       | 465 × 24 |
|  1646 |    715 |          303 | 1345 × 41       | 465 × 24 |
|  1440 |    578 |          303 | 1139 × 41       | 465 × 24 |
|  1280 |    418 |          303 | 979 × 41        | 465 × 24 |
|   700 |    276 |          487 | **not mounted** | 465 × 24 |
|   600 |    200 |          611 | **not mounted** | 465 × 24 |

The last two rows are outside this epic's complaints and worth recording anyway: at 600 px the
workspace spends **611 px of chrome above 200 px of diagram**.

---

## What the instrument got wrong, and how

Recorded because the first run's numbers were reported to the product owner as fact.

| defect                                                                                 | consequence                                                                           |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Deck resolved from the first `[data-toolbar-item]` (`mode-early`, a different toolbar) | converted 12 deck items, measured a row containing none — "36 → 36, no height saving" |
| Label taken as the last leaf span; `sr-only` spans render after the label              | every gated item reported a hidden span's position                                    |
| Status bar located by the copy `Data date`                                             | the anti-pattern `activity-bottom-panel.tsx` records biting three times               |
| Breadcrumb measured as a `flex-1` **track**                                            | 404–1044 px reported for a block whose ink is 424 px                                  |
| Pen sentence located by first matching `span`/`p`/`div`                                | matched a page-level ancestor: 7,526 px, and the font read off the wrong element      |
| Ink helper returned the union of leaf rects                                            | organisation switcher reported **1 px**, twice                                        |
| "Narrow" widths chosen as 900 and 768                                                  | both are ≥ the 48rem breakpoint, so the narrow layout was never reached               |
| `[data-toolbar-item="link"]`                                                           | the id is `link-tool`; the tool-armed dock case silently skipped                      |

Seven of the eight produced a plausible number rather than an error. That is the argument for
`clearMeasurement` + `measuredAt`, and for a probe that **throws** when its subject is absent.

## Separately: most of the measurement estate is broken

**Eight of the fourteen specs in `measure-toolbar/` fail in ~8 s each** — `header-fit`,
both `item-widths`, `loaded-plan`, `measure`, `menu-band`, `reachability`, `search-icon`. The uniform
failure time says stale locators, almost certainly from ADR-0109 deleting the tool rail and reshaping
the command surface. These priced four consecutive command-surface epics.

A broken harness is worse than a deleted one: it is present, looks authoritative, and its last
successful output is still sitting in `measure-output/` with no marker that it predates the redesign.
**Filed, not fixed here** — repairing eight harnesses does not belong inside a milestone about label
baselines.
