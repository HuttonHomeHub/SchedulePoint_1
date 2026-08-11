# M0 — the toolbar measurement, and what it falsified

> Status: **complete**. Taken 2026-08-11 against the real plan workspace in Chromium 1194, at the
> shipped flag defaults, through the real sign-up → client → project → plan journey.
> Harness: `apps/web/playwright.measure-toolbar.config.ts` +
> `apps/web/measure-toolbar/{measure,reachability}.spec.ts`.
> Raw output: reproduced in full below.
>
> `design.md` §0 states that every pixel figure in its §2 is arithmetic over class names and an
> assumed 6.6 px/character metric, and ends with two falsifiable predictions so the arithmetic could
> be disproved rather than defended. **Both were falsified**, and the measurement found a live
> defect that neither prediction anticipated. That is the mechanism working, not failing — but it
> means §2's numbers must not be quoted, and §4's recommendation rests on some of them.

## How to reproduce

```bash
scripts/e2e-local.sh --db-only
cd apps/web
DATABASE_URL='postgresql://app:app@localhost:5432/app_test?schema=public' \
BETTER_AUTH_SECRET='local-e2e-secret-at-least-32-characters-long' \
PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
MEASURE_OUT=/tmp/toolbar-m0.json \
npx playwright test --config=playwright.measure-toolbar.config.ts
```

## M0c — the correction, and the numbers that should be quoted

**The first two passes measured an empty plan, so every figure below them is a lower bound.**
The feature-analyst caught it: `measure.spec.ts` and `reachability.spec.ts` never add an activity,
so `ctx.hasDiagram` is false and three Row-1 items self-hide — `finish-chip`
(`isVisible: (ctx) => ctx.hasDiagram`, `tsld-toolbar-items.tsx:2360`, up to 160 px of
`max-w-[10rem]`), `next-conflict-status` and `search-status`. The inline census confirms it:
`finish-chip` appears in neither the bar nor the `⋯` at any width in those runs.

`loaded-plan.spec.ts` re-measures with the pen taken, two activities created and the schedule
computed — i.e. **any plan a planner would actually be looking at**. These are the numbers to quote:

| Viewport                         | Row 1 overshoot | `⋯`                       | Pointer-unreachable (0 px visible)        |
| -------------------------------- | --------------: | ------------------------- | ----------------------------------------- |
| **2133** (1920 @ 90%)            |       **35 px** | **absent**                | `shortcuts`                               |
| **1920 @100%**                   |      **109 px** | present, **0 px visible** | `legend`, `shortcuts`                     |
| **1440** (Surface Pro landscape) |       **79 px** | present, **0 px visible** | — (`summary` partly clipped)              |
| **960** (Surface Pro portrait)   |      **459 px** | present, **0 px visible** | `isolate-logic`, `finish-chip`, `summary` |

Row 2 is clean at 2133/1920/1440 and overshoots 67 px at 960, where `print` is partly clipped and
its `⋯` is also 0 px visible.

Three things this changes:

1. **The defect reaches 2133 — the configuration the product owner said looked _better_.** On an
   empty plan 2133 was clean (`scroll` = `client` = 2045). On a real plan Row 1 overshoots by 35 px
   and `shortcuts` is pointer-unreachable, with **no `⋯` rendered at all**. There is no measured
   desktop width at which this surface is correct on a real plan.
2. **At 1920 the `⋯` now renders — at zero visible width.** On the empty plan it was absent
   entirely; loaded, it exists, is focusable, and cannot be seen or clicked. That is arguably worse
   than absent, because the code believes it has provided a route.
3. **At 1440 the `⋯` went from 1 px visible to 0.**

> **A precision note, so this is not over-read.** Where the table says the `⋯` is 0 px visible,
> `loaded-plan.spec.ts` deliberately **does not open it** (it skips enumeration below 2 px, because
> a menu that cannot be clicked cannot be enumerated the way a user would). So its item count in the
> raw JSON is `0` meaning _not enumerated_, **not** _empty_. The empty-plan run at 1440 enumerated
> **14** items in the same button. Do not quote "the overflow menu is empty"; quote "the overflow
> button holding ~15 commands has zero visible width".

## M1-T1 addendum — the mechanism, attributed

> Run 2026-08-11 by `apps/web/measure-toolbar/attribution.spec.ts` (same harness, same command,
> `attribution` instead of `measure`), on a populated plan at eight widths. It decomposes each row's
> `scrollWidth` into item widths, group boxes, container gaps, intra-group gaps and each group's
> `margin-left + border-left + padding-left`, and probes all three candidates the plan refused to
> choose between by argument.

### Candidate (a) — chrome the calculation cannot see: **confirmed, and it is the mechanism**

|    Width | Row 1 overshoot | Σ item widths | chrome named | residual |
| -------: | --------------: | ------------: | -----------: | -------: |
|     2133 |              35 |          1910 |          144 |   **26** |
| **1920** |         **109** |          1782 |          128 |   **31** |
|     1600 |              25 |          1427 |           79 |   **31** |
|     1440 |              79 |          1325 |           75 |   **31** |
|     1280 |             139 |          1229 |           71 |   **31** |
|     1024 |             395 |          1229 |           71 |   **31** |
|      960 |             459 |          1229 |           71 |   **31** |
|      768 |             651 |          1229 |           71 |   **31** |

The chrome that can be named — the container's `gap-1` between children, each group's
`ml-1 border-l pl-2`, and each group's internal `gap-1` — accounts for **71–144 px** depending on how
many groups render, and `computeOverflow` is shown **none** of it (`Toolbar.tsx:172-181`). What is
left over is a **constant 31 px**, at every width, which is the strongest possible signature that the
model is structurally incomplete rather than noisy. Five of those 31 are the overflow wrapper's own
`border-l pl-1` (`:386`), which this walk skips because it is not a `role="group"` — and the row
where the `⋯` is absent reports **26**, exactly as that predicts.

**Row 2 is not exempt**; it merely fits at desktop widths. At 1024 it overshoots by **34 px with no
`⋯` rendered at all**, and at 960/768 by 67/43 with a residual of 50–55.

> Reading note: `unexplainedByItems` is only meaningful on a row that **overflows**. When a row fits,
> `scrollWidth` equals `clientWidth`, so the figure is just container slack — which is why Row 2's
> reads 1210 at 2133 and means nothing.

### Candidate (b) — two `ml-auto` boxes on one flex line: **present, and not the cause**

Row 1 carries two (`alignEndGroup` at `Toolbar.tsx:333`, the overflow wrapper at `:386`) wherever the
`⋯` renders. But the overshoot occurs at **all three** counts:

|              | `ml-auto` boxes | `⋯` rendered | overshoot |
| ------------ | --------------: | ------------ | --------: |
| Row 1 @ 2133 |           **1** | no           |     35 px |
| Row 1 @ 1920 |           **2** | yes          |    109 px |
| Row 2 @ 1024 |           **0** | no           |     34 px |

A cause that is absent while the effect is present is not the cause. It may still be a wrinkle worth
tidying; it is not what makes a row lie about its width.

> **This probe was wrong on its first run and would have recorded (b) as refuted for a false reason.**
> It tested `getComputedStyle(child).marginLeft === 'auto'`, which can never be true — computed style
> reports the **used** value in pixels — so it counted **zero** `ml-auto` boxes everywhere, including
> where two exist. Corrected to read the class list. The conclusion is unchanged; the evidence for it
> was not. Recorded because a probe that reports what you expected, for the wrong reason, is the
> failure this whole epic is about.

### Candidate (c) — promotion/overflow pass ordering: **refuted, and that matters later**

Eight consecutive settled frames at 1920 with no input: **one distinct state**, `scrollWidth`
constant at 1941 on Row 1 and 1832 on Row 2. There is no oscillation in the shipped code.

That is not a null result. It means any oscillation observed after M1 would be **introduced by the
fix** — which is precisely what the pre-approval review predicted would happen if the chrome were
measured from the DOM rather than derived, and it is why M1-T3's tests A and B assert against this
baseline rather than against nothing.

### What M1 must therefore do

Teach `computeOverflow` the chrome, **derived** from static registry data — never read from group
boxes, which are themselves a function of the overflow decision. The constant residual says the
derivation must also carry a per-row allowance for the chrome no group-level walk attributes (the
overflow wrapper's rule; the search field's leading margin), or the budget stays wrong by ~31 px —
which at 1600 would be the entire difference between fitting and not.

## The finding that outranks the design

_The figures in this section are from the **empty-plan** pass and are lower bounds; see M0c above for
the loaded-plan numbers._

**At 1920 × 1080 @ 100% — the product owner’s exact configuration — two Row-1 commands are
rendered outside their `overflow-hidden` container with no `⋯` offering them.**

| Item        |  width | overhang past the container's right edge | visible width | pointer reaches it | keyboard                |
| ----------- | -----: | ---------------------------------------: | ------------: | ------------------ | ----------------------- |
| `summary`   | 126 px |                                     9 px |        116 px | yes                | yes                     |
| `legend`    |  32 px |                                    58 px |      **0 px** | **no**             | yes (container scrolls) |
| `shortcuts` |  32 px |                                    94 px |      **0 px** | **no**             | yes (container scrolls) |

Row 1's `scrollWidth` is **1926** against a `clientWidth` of **1832** — 94 px over — and
`overflowPresent` is **false**: the `⋯` is not rendered at all. So the two controls are not
"in the overflow menu", they are nowhere. `document.elementFromPoint` at each control's centre
returns something else, and at its visible sliver too, because there is no visible sliver.

They remain focusable — the browser scrolls an `overflow: hidden` box to reveal a focused
descendant — so this is **pointer-unreachable, keyboard-reachable**. A mouse and touch user cannot
open the Legend or the Keyboard-shortcuts sheet on a 24″ 1080p monitor. The exact WCAG criterion is
for the accessibility reviewer to name (2.5.8 Target Size is the obvious candidate, since the
effective pointer target is 0 × 0); this document records the behaviour, not the citation.

### It is far worse on the device that prompted the request

| Viewport                         | What is pointer-unreachable                                                                                                                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1440** (Surface Pro landscape) | the **`⋯` button itself** is 32 px wide with **1 px visible** — and it is the only route to **14** Row-1 commands                                                                                                 |
| **960** (Surface Pro portrait)   | `isolate-logic` (0 px visible), `summary` (0 px visible), **and the `⋯`** (0 px visible) — so ~18 Row-1 commands, plus Row 2's `⋯` (0 px visible) holding Share and Comments; `print` is reduced to a 6 px sliver |
| **768**                          | Row 1's `⋯` holds 16 items; Row 2's holds 8                                                                                                                                                                       |

At Surface Pro landscape the overflow menu — the mechanism the whole design relies on — is one
pixel wide.

## P1 — falsified

> Predicted: at 1920 @100% Row 1's `⋯` contains exactly _Go to today_ and _Zoom to selection_; at
> 2133 there is no `⋯`.

Measured: at 1920 there is **no `⋯` at all**, and 24 items are inline. At 2133 there is likewise no
`⋯`, but for the right reason — `scrollWidth` equals `clientWidth` (2045). The prediction named the
wrong mechanism: the row does not demote two items, it fails to demote anything and lets three fall
off the edge.

## P2 — falsified

> Predicted: at 960 every Row-1 command is still reachable (inline or via `⋯`); the failure is
> truncation, not loss.

Measured: at 960 the `⋯` is itself clipped to zero visible width, and two pinned controls
(`isolate-logic`, `summary`) are clipped to zero with no `⋯` entry — a pinned `render` item cannot
demote (`Toolbar.tsx:153-156`), so there was never a route to them. Commands _are_ lost to pointer
users. The design flagged this outcome as the case that "outranks this entire design"; it is the
case.

`design.md` §2.3 records that the brief hypothesised clipping-with-no-`⋯`-route and that the design
believed it wrong. **The brief was right and the design was wrong**, though not for the reason the
brief gave: the cause is not that pinned items cannot demote (true, but secondary) — it is that the
overflow pass does not fire when it should.

## §2.4 — also falsified, in the opposite direction

> Claimed: Row 1 needs a ≈2560 px container to label its `'auto'` items; Row 2 needs ≈2700 px.
> "Row 1 needs a 2560 px monitor to show its labels. The product owner has 1920."

Measured at 1920: Row 1 shows **21 labelled items of 24 inline**; Row 2 shows 10 of 19. Labels are
promoted at 1920, not withheld. The 6.6 px/character estimate was substantially wrong.

This inverts the story. The labels are not missing — **the labels are why it breaks.** The
promotion pass decides the row can afford them, the row grows 94 px past its container, and the
overflow pass does not catch the result, so instead of dropping labels or demoting commands, three
controls fall off the edge.

## Leading candidate mechanism — cited, not asserted

`computeOverflow` is handed only item widths: `pinnedWidth` sums the pinned items' boxes
(`Toolbar.tsx:172-174`), `widths` the demotable ones (`:175`), and the budget is
`available − pinnedWidth` (`:181`). **Neither sum contains any of the row's chrome.** The container
carries `gap-1` between children (`:322`), each group carries `gap-1` internally plus
`ml-1 border-l pl-2` at its leading edge (`:331`), and the item refs sit on the controls themselves,
so none of that spacing is measured by anything.

Row 1 at 1920 has 24 inline items across 6 rendered groups: ≈23 × 4 px of gap plus ≈6 × 13 px of
group rule ≈ **170 px** of layout the calculation cannot see, against a measured overshoot of
**94 px**. Consistent, and the right order of magnitude — but this is one candidate, established by
reading the code and comparing two numbers, **not by instrumenting the calculation**. A second
candidate is the two `ml-auto` boxes sharing one flex line (`alignEndGroup` at `:333` and the
overflow wrapper at `:386`). The implementation plan should establish which, or both, before fixing.

## What this does to the design

- §2.3's pinned-floor table, §2.4's label arithmetic and the 2560/2700 px figures are **withdrawn**.
- §1.2's framing ("the `⋯` is visible and every command is reachable") is **false at every width
  measured except 2133**, and must be rewritten.
- The recommendation (Option B) is not necessarily wrong — it reduces the item count, which helps
  regardless — but it was chosen against numbers that did not hold, so it needs re-deriving against
  these.
- A **repair milestone now outranks the redesign**: the overflow calculation is under-counting the
  row it is meant to measure, and the consequence is unreachable commands in the shipped product at
  the commonest desktop resolution there is. That is a fix to ship on its own, not a step in a
  layout epic.

## Raw output

`measure.spec.ts`, per width — `container` / `scroll` are the row's `clientWidth` / `scrollWidth`:

```
2133 (1920 @ 90%)
  View and navigate: container=2045 scroll=2045 inline=24 labelled=21 overflow=none
  Build and manage : container=2045 scroll=2045 inline=19 labelled=10 overflow=none
1920 @100%
  View and navigate: container=1832 scroll=1926 inline=24 labelled=21 overflow=none
                     CLIPPED: summary, legend, shortcuts
  Build and manage : container=1832 scroll=1832 inline=19 labelled=10 overflow=none
1440 (Surface Pro landscape)
  View and navigate: container=1352 scroll=1383 inline=10 labelled=9 overflow=14
                     ⋯ : Zoom out, Zoom in, Fit to plan, Zoom to selection, Go to today,
                         Baseline overlay, Resource view, Flag over-allocated, Diagram, Gantt,
                         Next conflict, Float paths, Legend, Keyboard shortcuts
  Build and manage : container=1352 scroll=1352 inline=19 labelled=10 overflow=none
960 (Surface Pro portrait)
  View and navigate: container=872 scroll=1177 inline=8 labelled=7 overflow=16
                     CLIPPED: isolate-logic, summary
  Build and manage : container=872 scroll=939 inline=17 labelled=10 overflow=2 (Share…, Comments)
                     CLIPPED: print
768 (md breakpoint)
  View and navigate: container=680 scroll=1177 inline=8 labelled=7 overflow=16
                     CLIPPED: summary
  Build and manage : container=680 scroll=723 inline=11 labelled=6 overflow=8
```

One incidental fact worth keeping: at 1440 the **Diagram | Gantt** pair and at 960 the
**Early | Visual** pair are both in the `⋯` _in full_, so the design's "a two-state switch can lose
one state to the overflow" concern did not reproduce at any measured width. It remains possible by
the demotion sort (`toolbar-registry.ts:310-318`) — both halves are demotable with adjacent `order`
values — but it is **not observed**, and should be recorded as a latent risk rather than a defect.
