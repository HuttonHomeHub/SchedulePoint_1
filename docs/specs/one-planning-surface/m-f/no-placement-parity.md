# M-F — FC-7 Part A, at the product

**Judged 2026-09-20** against `fd69dbd6`. FC-7's Part A bar: for a seeded plan with **no
placement, no strip-eligible `SNET`, no progress, no LOE and no `WBS_SUMMARY`**, every user-visible
date is identical before and after M-F — canvas, Gantt cells and bars, framed span, print, exported
PNG, CSV, guest view, baseline variance, float read-outs.

**Verdict: PASS**, on a census plus a standing product-level gate. Two consequences of the collapse
that Part A does **not** cover are recorded in §5 rather than left to be rediscovered.

**It is judged against the tree the sweep ran on, plus one fix that sweep produced** — the
placement auto-recalculation gap (`m-f/collapse.md` §6). That fix changes **when** the schedule is
re-derived and not **which** dates any surface reads, so it moves nothing in the census below; it is
named here because a verdict that quietly spans two trees is the thing this file exists to avoid.

---

## 1. Why this is a census and not a screenshot diff

A before/after image comparison would judge **one plan at one width** and would have to be re-taken
by hand. The stronger statement is available here because the collapse has a narrow mechanism: M-F
changed **which of two already-computed columns a bar is drawn from**, and nothing else about any
date. So Part A reduces to two checkable claims:

- **(A)** for the qualifying plan shape, `visualEffective* === early*` — asserted at the **product**,
  through the public REST API, not at the engine (ADR-0066); and
- **(B)** every surface Part A names either resolves its basis through the one producer
  (`barDateSourceFor` / `barDatesFor`) or never consulted `schedulingMode` at all.

(A) makes the two bases interchangeable for this shape; (B) establishes that no third basis exists
to have moved. Together they cover **every** plan of the qualifying shape, not one fixture.

## 2. Claim (A) — already a standing gate, and its controls are exactly Part A's shape

`apps/api/test/placed-basis-parity.e2e-spec.ts` (M-P-T3, FC-7 Part B) builds its fixture through
`POST …/plans/:id/activities` and `POST …/schedule/recalculate` with **no `visualStart` sent
anywhere**. Three of its eight rows — `SPINE` (plain 3-day), `TAIL` (plain 2-day, FS after `SPINE`)
and `LEAD` (plain 5-day) — are **plain tasks with no constraint, no progress and no parent**: Part
A's qualifying shape precisely. All three agree on both dates.

Part B's record calls them "the control: a run in which everything was broken would look the same
as one in which nothing was, without them". They are **also** Part A's evidence, and that is a
property of the fixture rather than a coincidence — Part A's shape is Part B's shape minus the four
rows Part B was written to exercise.

**No new spec was written, and that is the honest outcome rather than a saving.** A second e2e
asserting the same equality over three more plain tasks would add a file and no information.

## 3. Claim (B) — the basis census, derived from the diff

Every non-test `apps/web` file that **lost** a `schedulingMode` / `useVisualMode` reference across
the epic (`git diff 7519437f..fd69dbd6 -- apps/web/src`), classified by whether it decided a
**displayed date**:

| File                                                                                                                                          | What the mode decided                   | Displayed date? |
| --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | --------------- |
| `components/layout/workspace/plan-workspace-toolbar.tsx`                                                                                      | the `barDateSourceFor(...)` call        | **YES**         |
| `features/tsld/toolbar/commands/use-diagram-image.ts`                                                                                         | the exported PNG's basis                | **YES**         |
| `components/layout/workspace/use-plan-workspace-model.ts`                                                                                     | what a drag **writes**                  | no              |
| `features/gantt/model/cell-commit.ts`, `use-gantt-grid-editing.ts`                                                                            | what a typed date **writes** (ADR-0134) | no              |
| `features/plans/api/use-plans.ts`                                                                                                             | the DTO field                           | no              |
| `features/schedule-health/{components/ScheduleHealthPanel,print/HealthPrintDocument}.tsx`                                                     | displayed **provenance**                | no              |
| `features/plan-actions/{conflict-remedy.ts,selection-actions.tsx}`                                                                            | which controls appear                   | no              |
| `features/tsld/toolbar/{tsld-toolbar-context.ts,tsld-toolbar-items.tsx,use-tsld-toolbar-context.tsx,plan-summary-panel.tsx,test-helpers.tsx}` | controls / the mode read-out            | no              |
| `components/ui/toolbar/use-focus-handoff.ts`                                                                                                  | focus (ADR-0135)                        | no              |

**Exactly two sites decided a displayed date, and both call the one producer.** There is no third
basis anywhere for the collapse to have moved.

The surfaces Part A names, and where each gets its dates:

| Surface                              | Basis                                                                                                                                                                                                            | Moved at M-F?                 |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Canvas bars, WBS band, framed span   | `toRenderActivities(…, source)` → `barDatesFor`                                                                                                                                                                  | only where a placement exists |
| **Minimap**                          | `RenderActivity` — see §4                                                                                                                                                                                        | as the canvas                 |
| Gantt bars, cells, sort, span, print | `barGeometry` / `grid-columns` / `row-model` / `GanttPrintSurface`, all `barDatesFor`                                                                                                                            | as the canvas                 |
| Exported PNG                         | `use-diagram-image.ts:145` → `barDateSourceFor`                                                                                                                                                                  | as the canvas                 |
| **CSV**                              | `earlyStart` directly; column headed **"Early start"**                                                                                                                                                           | **no** — see §5.1             |
| **Guest view**                       | `TsldPanel`'s `barDateSource` default `'early'`                                                                                                                                                                  | **no** — see §5.2             |
| Float read-outs                      | `early*`, **by decision** — `bar-dates.ts` records that `'early'` "survives for the analyses, which measure the network rather than the plan as placed", gated by `float-paths-view-agnostic.structural.test.ts` | no                            |
| Baseline variance                    | server `BaselineVarianceRow`s; `TsldPanel:1358` passes `lateView: barDateSource === 'late'`                                                                                                                      | basis-aware already           |

For the qualifying shape the first four rows are unchanged **because the two bases are equal** (§2);
the rest are unchanged **because they never consulted the mode**. Part A holds either way.

## 4. A near-miss, recorded because the next reader will hit it too

`minimapRects` (`render/minimap.ts:309-310`) reads `a.earlyStart` / `a.earlyFinish` with no
`source` parameter, which reads as the one-screen contradiction
`date-source-consistency.test.ts` was written about. **It is correct**:
`toRenderActivities` writes the **resolved** span into `RenderActivity.earlyStart` /
`.earlyFinish` (`to-render-model.ts:52-57`), so those field names carry the drawn basis, not the
early dates. The minimap draws what the canvas draws.

**The field name is the hazard, not the code.** A `RenderActivity.earlyStart` that may hold visual
or late dates is a trap for anyone reading `minimap.ts` alone; what stops it becoming one is that
`RenderActivity` is a distinct type from `ActivitySummary`, so passing the wrong shape is a compile
error. Recorded so the next reader does not "fix" it — and so the type distinction is understood to
be load-bearing rather than incidental.

## 5. Two consequences Part A does NOT cover

Neither falsifies Part A — both are about plans **with** a placement, which Part A excludes by
construction. Both are widened by the collapse rather than created by it, and both are recorded
here because nothing in the epic's plan names them.

### 5.1 The CSV exports a basis the canvas no longer draws

`export-csv.ts:80` emits a column headed **"Early start"** from `a.earlyStart`. The label is honest
— it says what it is — so this is not the `#135` class of silent disagreement. But a planner who
places bars and exports "the plan" gets the **computed** dates, and after the collapse placing bars
is the normal way to work rather than a mode somebody opted into.

### 5.2 A share link draws early dates while its author sees placed ones

Five checked facts, no inference past them:

1. `visualEffectiveStart` / `visualEffectiveFinish` are on the guest DTO's **forbidden** list
   (`apps/api/src/modules/share/dto/guest-dto.spec.ts:136-137`), under an exact-key assertion.
2. The web guest adapter therefore sets both to `null` (`features/share/guest-api.ts:227-228`).
3. `TsldPanel`'s `barDateSource` prop defaults to `'early'` (`TsldPanel.tsx:601`).
4. `GuestPlanView` passes no `barDateSource` (`GuestPlanView.tsx:255-261`).
5. The member view draws `visualEffective*` unconditionally since M-F (`bar-dates.ts`,
   `plan-workspace-toolbar.tsx:482`).

So **the one artefact a planner hands to somebody who was not in the room shows the bars somewhere
other than where the planner put them.** Before the collapse this diverged only for `VISUAL` plans;
the collapse makes every plan a planning surface, so the affected population is now every plan
carrying a placement.

**Not fixed here, and deliberately not fixed quietly.** Widening the guest projection is a change to
the ADR-0051 `SCHEDULE_READ` scope — a security boundary — which is an ADR-0105 full-spec trigger,
not something to fold into a milestone whose subject is the toolbar. It is filed with the decision
left open and raised with the product owner.
