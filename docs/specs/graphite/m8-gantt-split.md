# Graphite M8 — the Gantt split, and a fork that turns out not to exist

**Status:** planned · **ADR:**
[ADR-0099](../../adr/0099-graphite-the-workstation-in-rail-chrome.md) · **Follows**
[`m7-status-bar.md`](m7-status-bar.md)

## §A15 asks for a decision before anything is built. Here it is: neither branch.

`plan.md` §A15 states the fork:

> Today the Gantt is one `role="treegrid"` whose rows already span grid and timeline. Split into two
> panes it must be either **one row spanning both via CSS Grid** or an explicit
> `aria-owns`/`aria-rowindex` association. Two visually-aligned tables would break row/bar
> correspondence the moment they scroll a row apart. **Decide before either is built.**

**The premise is false, and it has been since ADR-0059.** The Gantt is not one pane waiting to be
split into two. It is already a grid beside a chart, and `GanttPanel.tsx`'s own docblock makes the
same argument §A15 does, three milestones earlier:

> **The lockstep is structural, not synchronised.** Grid and bars live in ONE scroll container; the
> grid column is `position: sticky; left: 0` and the ruler `top: 0`. There is no scroll listener, no
> second scroller and no rAF loop keeping two panes aligned — which is exactly the class of defect
> (visible desync on momentum scroll) that a two-scroller design invites and that no test catches
> reliably.

So the row/bar correspondence §A15 is protecting is not something to _achieve_; it is something to
**not break**. Both offered branches are worse than what exists: one row spanning both via CSS Grid
is what `position: sticky` already delivers with no second layout system, and an
`aria-owns`/`aria-rowindex` association buys an explicit link between two things that are already
one element.

**The decision is therefore to keep the single scroll container and the sticky grid column, and to
build neither branch.** Recorded rather than skipped, because "we considered it and the premise did
not hold" and "nobody read the paragraph" leave the same empty diff.

`useVirtualizer` is likewise already singular (`GanttPanel.tsx:429`), so "ONE virtualizer" is a
property to preserve, not to introduce.

## What is actually missing: the splitter

`design.md` §2 asks for "grid **beside** the chart **with a draggable splitter**". The grid's width
is derived — `GRID_WIDTH` sums the visible columns — so a planner can change it only by hiding a
column. That is the one part of M8 that is not already true.

And the primitive for it is built. `components/ui/panel-resizer.tsx` is an **APG window splitter**
already — `role="separator"`, `aria-valuenow`, keyboard steps — and
`use-resizable-panel-prefs.ts` describes itself as _"the single implementation behind both the
Project Explorer rail (vertical splitter → width)"_, which the Graphite drawer also uses. §A15's
warning that the splitter must not be a mouse-only handle is satisfied by using the component that
already satisfies it, rather than by writing a second one.

## The one real question, and it is about the sticky column

A `position: sticky` column inside a horizontally-scrolling container has a fixed width today
because `GRID_WIDTH` is a number. Making it draggable means that number becomes state — which is
fine — but it must stay **the same number in three places**: the header cell, every row's leading
cell, and the bar region's left offset. They are computed from `GRID_WIDTH` today, so the work is to
route one value rather than to introduce one.

**The failure mode to avoid is the ADR-0095 one, verbatim**: `GRID_WIDTH` was once a literal that
disagreed with its own columns, and measuring before adding one found Float rendering 80 px on top
of the chart. A resizable width has the same shape and a wider blast radius, so the acceptance
condition is that the three sites read one source.

## Sequence

| Task                                                                          | Ends with                                                                                                                                    |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **T1** Route the grid width through `useResizablePanelPrefs` + `PanelResizer` | The three sites read one value; a structural test says so                                                                                    |
| **T2** Bounds and persistence                                                 | A minimum that keeps the identity column readable, a maximum that leaves the chart usable, persisted per the existing hook                   |
| **T3** Keyboard and announcement                                              | Inherited from `PanelResizer`; asserted here rather than assumed, because this is its third consumer and the first inside a scroll container |

## As built, and the defect the first version had

The splitter is `PanelResizer` — the existing APG window splitter — positioned over the scroller
rather than inside it. That placement is forced twice over: the grid column is
`position: sticky; left: 0`, so its right edge is measured from the **scroller** and not from the
content; and a `role="row"` may contain only cells, which ADR-0095 M5-T3 already paid for
discovering.

**The first version reproduced the exact defect this document had named as the one to avoid.** With
the columns at fixed widths, dragging narrower did not clip them — it pushed them over the chart.
Measured in a browser at the 180 px floor I had guessed: the headers still occupied 0–584 while the
Timeline began at 180, so five columns painted on top of the bars. That is ADR-0095's `Float`
incident again, in the milestone whose plan quotes it.

Two things fix it, and the second is what makes the splitter worth having at all:

1. **The floor is computed, not guessed.** `min` is what the _fixed_ columns actually need — 524 with
   the default set — and it changes as columns are hidden. A guessed round number cannot track that.
2. **The name column absorbs the difference.** One `resolveColumnWidth` gives `name` whatever the
   pane has beyond the fixed columns, floored at 120. Without it a splitter is useless in both
   directions: wider adds blank space, narrower destroys the layout.

Measured after: floor 524 with Timeline beginning at 524 (no overlap), and at 712 the Activity column
takes the extra 188 px rather than leaving a gap.

`resolveColumnWidth` is threaded to the header, the activity rows and the bucket rows, and **all
three read it** — including the bucket row's first-column reads, which used the fixed lookup. That
was a latent disagreement rather than a live one: hide `code` and `COLUMNS[0]` becomes `name`, whose
fixed width is not its resolved width.

## What the journeys found, and none of it was the splitter

`e2e-gantt-editing` came back **6 of 27 failed**, and not one failure was M8's. All six were the M5
merge's `priority` consequence reaching a suite nobody had run: **the M5 sweep was stopped during
`gantt-editing`**, so it is the one suite that has never been verified since the two command rows
became one.

- **Eleven `getByRole('button', { name: 'Recalculate' })` calls across six files.** Same class as
  `e2e/schedule`'s `Settings…` (M7) and `e2e-library`'s `calendar` (M5): a command located by copy,
  which works only while the ladder happens to leave it inline in that view at that width. All
  eleven now use one `clickToolbarCommand(page, id)`.
- **An `Add note` assertion that was wrong in both directions at once.** It asked
  `getByRole('button', …)`, which sees only the row — so it read "retired from the Gantt" _and_
  "gone from the Diagram" for the same reason: `add-note` had moved into the `⋯`. A negative
  assertion about a command has to look in the menu too, or it starts passing for the wrong reason
  the moment the ladder demotes its subject. `toolbarOffers(page, id)` asks the whole strip and
  leaves the `⋯` as it found it.

Three suites have now needed the same helper. The rule this keeps proving is the one already
written down after ADR-0091: **locate a command by its registry id, never by its copy** — and the
corollary M8 adds is that "not present" needs the same treatment as "present".

## Gates

`pnpm lint && typecheck && test` · `scripts/e2e-local.sh web` (the base journey — M7 found it red for
two milestones because nothing ran it) · `web:gantt` · `web:gantt-editing` ·
`node scripts/shoot.mjs --width 1646`, then look at it.
