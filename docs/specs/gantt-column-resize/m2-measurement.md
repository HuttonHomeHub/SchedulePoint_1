# M2-T4 — Performance and touch readings

Evidence for [`implementation-plan.md`](implementation-plan.md) task M2-T4 (ADR-0128: a measurement
belongs on the machine that can take it; ADR-0142: a remedy is measured before it is built). **Two of
the three readings are owed**, and are marked so: a headless container browser is software-rasterised
and is not the target envelope, so its frame figures would be exactly the kind ADR-0128 withdrew.

## (a) What was established without a browser, and how

Read in `apps/web/src/features/gantt/` at the M2 commit, and pinned by tests that fail if it changes:

| Property the spec's success criteria name     | Established by                                                                                                                                                       |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| At most one state update per animation frame  | `use-pointer-drag.test.tsx` — two moves in one frame call `onValue` once; the rAF is the only path from a move to state                                              |
| One `localStorage` write per gesture          | `use-gantt-column-widths.test.ts` — 30 `setTransient` calls write nothing, `commit` writes exactly one; `GanttPanel.column-widths.test.tsx`, same, through the panel |
| The bars' px-per-day does not change mid-drag | `grid-width.structural.test.ts` — `setBarRegionWidth`'s input is `DEFAULT_GRID_WIDTH` and none of `gridWidth`, `FIXED_WIDTH`, `columnWidths`                         |
| The edge never writes storage itself          | `grid-width.structural.test.ts` — neither `GanttColumnEdge.tsx` nor `use-pointer-drag.ts` names `localStorage`                                                       |
| A drag never sorts                            | `GanttPanel.column-widths.test.tsx` — every `aria-sort` is as it was after press, move, release and click                                                            |

Command: `pnpm --filter @repo/web exec vitest run src/components/ui/use-pointer-drag.test.tsx src/features/gantt`.

## (b) Frame cost of a column drag on 2,000 activities — **OWED**

**Who/where:** the product owner's machine (ADR-0128), the same Chromium and display as `docs/TECH_DEBT.md`
#75's sittings.

Seed a 2,000-activity plan (`--tier scale --activities 2000`, `docs/TEST_PLAYBOOK.md` Tier 4; the exact
invocation is that document's). Open the plan, Gantt view, **Week** zoom. DevTools → Performance → record, press the Code header's right
edge and drag 200 px right in one stroke, release, stop. Record: frame-interval p95, frames dropped,
the number of React commits per frame, whether `pxPerDay` changed (it must not), and any forced layout
under the pointer handler.

| Reading                                       | Value    |
| --------------------------------------------- | -------- |
| Date, machine, viewport, DPR, browser version | **OWED** |
| Frame interval p95 / frames dropped           | **OWED** |
| React commits per frame (expect 1)            | **OWED** |
| `pxPerDay` changes during the drag (expect 0) | **OWED** |
| Forced layout in the handler (expect none)    | **OWED** |

**If it misses** §9's floor (≥ 30 fps at 2,000), stop and report — do not optimise blind (ADR-0142).

## (c) Touch on the new strip, fine-primary touch device — **OWED**

The strip carries `touch-action: none`, so a finger on a fine-primary screen should drag rather than
scroll; under `pointer: coarse` it is not rendered at all (asserted by
`e2e-gantt/column-widths.spec.ts`). On a Surface-class device (coarse reported only for the touchscreen
when the primary pointer is fine), press the Code edge with a finger and drag.

| Reading                                                                   | Value    |
| ------------------------------------------------------------------------- | -------- |
| Does the finger drag the column rather than scroll the grid?              | **OWED** |
| Event sequence (`pointerdown`, `pointermove` count, `pointerup`/`cancel`) | **OWED** |

This is the same question #439 asks of the shared divider, which has no `touch-action` rule; a result
here is evidence for it, not a fix to it.
