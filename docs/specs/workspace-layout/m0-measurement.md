# M0 — the toolbar measurement, and what it falsified

> Status: **complete**. Taken 2026-08-11 against the real plan workspace in Chromium 1194, at the
> shipped flag defaults, through the real sign-up → client → project → plan journey.
> Harness: `apps/web/playwright.measure-toolbar.config.ts` +
> `apps/web/e2e-measure-toolbar/{measure,reachability}.spec.ts`.
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

## The finding that outranks the design

**At 1920 × 1080 @ 100% — the product owner's exact configuration — two Row-1 commands are
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
