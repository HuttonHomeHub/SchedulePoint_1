# M1-T0 — Measurement record

Evidence for [`implementation-plan.md`](implementation-plan.md) task M1-T0 (ADR-0113, ADR-0142): the
problem is measured before the remedy is built. Nothing here changes the product.

**Command** (from the repository root, after `scripts/e2e-local.sh --db-only`):

```sh
pnpm --filter @repo/web measure:gantt --grep "M1-T0"
```

Spec: `apps/web/measure-gantt/column-truncation.spec.ts`. Output (gitignored):
`apps/web/measure-output/gantt-column-truncation.json` and `gantt-column-truncation.md`.

**Run:** 2026-10-03, 1 passed in 1.8 minutes, **container Chromium** (not the product owner's Surface
Pro; pixel figures are layout boxes and do not depend on the GPU, but text widths use the container's
fonts).

**Fixture:** ten activities with deliberately **15-character codes** (`WBS-A.00.B.0000`) and up to three
predecessors each, seeded through the REST API by the spec (`docs/TEST_PLAYBOOK.md`'s `plan:scale-500`
has short codes and single predecessors). **Real codes may be shorter**, so the Code figure is a
worst case for structured codes; the Predecessors truncation does not depend on code length (it lists
activity names). Viewports 1646, 1024 and 390 px, each limb in a fresh context.

## (a) Truncated cells at default widths

The figures are identical at all three viewports (the widths are fixed), counted over ten mounted rows,
visible text only (visually-hidden descriptions excluded).

| Column       | Truncated | Visible text in cell              |
| ------------ | --------- | --------------------------------- |
| Code         | 10 / 10   | 99 px in 80 px                    |
| Activity     | 10 / 10   | 240 px in 180 px                  |
| Duration     | 0 / 10    | 17 px in 84 px                    |
| Start        | 0 / 10    | 68 px in 90 px                    |
| Finish       | 0 / 10    | 68 px in 90 px                    |
| Float        | 0 / 10    | 14 px in 60 px                    |
| Predecessors | 9 / 10    | 240 px in 90 px (shown by choice) |

The problem statement holds: Code, Activity and Predecessors truncate at default widths. Duration,
Start, Finish and Float do not.

## (b) `barRegionWidth` against the visible chart after a `Grid width` drag

Drag +118 px (pane 584 to 702).

| Viewport | Assumed bar region | Actual after drag | Chart header changed | Quarter header px (before / after) |
| -------- | ------------------ | ----------------- | -------------------- | ---------------------------------- |
| 1646     | 785 px             | 667 px            | yes (Month 604)      | 151 / 151                          |
| 1024     | 163 px             | 45 px             | no                   | 420 / 420                          |

**Defect.** The preset keeps framing for the default pane; at 1024 px the chart is left 45 px wide.
Filed as `docs/TECH_DEBT.md` #436.

## (c) The Gantt at 390 px

The pinned block (584 px) exceeds the 390 px scroller; the document itself does not overflow
(`scrollWidth` 390). The chart is **0 px visible at scroll 0 and at maximum scroll**.

**Defect.** Filed as #437.

## (d) Touch drag of the `Grid width` separator

At 1646 and 1024 px the separator moved (584 to 600), but computed `touch-action` is `auto` and the
events were one `pointerdown`, three `pointermove`s and a `pointercancel`. At 390 px the separator is at
x=581, outside the viewport, and cannot be touched.

**Defect.** Filed as #438.

## Decision

Truncation is genuine (a), so **proceed to M1-T1**. (b), (c) and (d) are filed as #436 to #438 and are
**not** fixed in this epic, per the plan.
