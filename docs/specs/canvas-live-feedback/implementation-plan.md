# Implementation Plan: Canvas live feedback & GPM float/drift visualisation

Epic for [ADR-0054](../../adr/0054-canvas-live-feedback-and-float-visualisation.md); spec in
[`feature-spec.md`](./feature-spec.md). **Frontend-only** — no API, DTO, schema or engine
change, so the ADR-0034 recalculation parity gate is structurally untouched. All of it sits
behind `VITE_CANVAS_LIVE_FEEDBACK` (default off until M6).

## M1 — Ghost fidelity + source dimming

| Task  | What                                                                                               | Files                       |
| ----- | -------------------------------------------------------------------------------------------------- | --------------------------- |
| M1-T1 | `InteractionOverlay.liveBar` — the ghost carries label, progress, milestone shape, not just a rect | `render/paint.ts`           |
| M1-T2 | `TsldScene.dimmedForGestureId` — the source bar paints at reduced alpha while its ghost is live    | `render/paint.ts`           |
| M1-T3 | Publish both from the canvas shell off the existing gesture state                                  | `components/TsldCanvas.tsx` |
| M1-T4 | Unit tests: ghost draws the label; source dims; flag-off byte-parity                               | `render/paint.test.ts`      |

**Complexity** low. **Risk** low — one shape, gesture-only. **Tests** painter unit tests
asserting the draw-call sequence, plus the flag-off parity assertion.

## M2 — Cursor date chip + guideline + ruler tick

| Task  | What                                                                                           | Files                           |
| ----- | ---------------------------------------------------------------------------------------------- | ------------------------------- |
| M2-T1 | `cursorDateLabel(state, view, dataDate)` — pure: which datum the chip states, per gesture kind | `render/cursor-readout.ts`      |
| M2-T2 | `InteractionOverlay.cursor` — chip + vertical guideline paint                                  | `render/paint.ts`               |
| M2-T3 | Emphasise the hovered day's ruler tick                                                         | `render/paint.ts`               |
| M2-T4 | Shell wiring: publish cursor day on move, clear on leave                                       | `components/TsldCanvas.tsx`     |
| M2-T5 | Unit tests for every gesture kind's label + the idle-hover case                                | `render/cursor-readout.test.ts` |

**Complexity** medium — the "which datum" mapping is the substance and is pure, so it is
exhaustively testable. **Risk** low. **Dependency** none.

## M3 — Flanking date labels + Dates toggle + LOD

| Task  | What                                                                                       | Files                            |
| ----- | ------------------------------------------------------------------------------------------ | -------------------------------- |
| M3-T1 | Carry raw start/finish onto `RenderActivity` at the mapping seam                           | `render/to-render-model.ts`      |
| M3-T2 | `dateLabelSlots(rects, view, measure)` — pure LOD + collision decision                     | `render/render-model.ts`         |
| M3-T3 | Paint pass, culled before any `measureText`                                                | `render/paint.ts`                |
| M3-T4 | **Dates** toggle in the View toolbar group + legend note                                   | `toolbar/tsld-toolbar-items.tsx` |
| M3-T5 | **Measure** draw time at 2,000 activities, dates on and off; set the LOD threshold from it | `render/paint.perf.test.ts`      |

**Complexity** medium. **Risk** the epic's highest — see ADR-0054 §3. M3-T5 is a **gate**, not
a formality: if the budget cannot be held, the toggle ships default-off and the measurement is
recorded in this plan.

## M4 — Float & drift tails

| Task  | What                                                                    | Files                                                         |
| ----- | ----------------------------------------------------------------------- | ------------------------------------------------------------- |
| M4-T1 | Carry `totalFloat` / `visualDriftDays` onto `RenderActivity`            | `render/to-render-model.ts`                                   |
| M4-T2 | `floatTailRect` / `driftTailRect` — pure geometry in day-space          | `render/render-model.ts`                                      |
| M4-T3 | Hollow + hatched tail paint, below the bar layer's labels               | `render/paint.ts`                                             |
| M4-T4 | Lens toggle beside Baseline overlay + two legend entries                | `toolbar/tsld-toolbar-items.tsx`, `components/TsldLegend.tsx` |
| M4-T5 | Tests: geometry, zero/null float draws nothing, Early-mode drift absent | `render/render-model.test.ts`                                 |

**Complexity** low–medium. **Risk** low — no text, two stroked rects per bar, culled with the
bar. **Note** drift is absent in Early mode by construction (ADR-0054 §4) and a test pins that.

## M5 — Relationship slack on the selected activity's links

| Task  | What                                                                       | Files                    |
| ----- | -------------------------------------------------------------------------- | ------------------------ |
| M5-T1 | `edgeSlackDays(edge, pred, succ)` — pure, on the edge's lag calendar walk  | `render/render-model.ts` |
| M5-T2 | Annotate only edges incident to the selection                              | `render/paint.ts`        |
| M5-T3 | Tests incl. "no selection ⇒ no annotations" and driving-edge-slack-is-zero | `render/paint.test.ts`   |

**Complexity** low. **Dependency** M4 (shares the slack vocabulary and legend section).

## M6 — Reviews, measurement, flip, release

Specialist reviews (**ux**, **accessibility**, **component**, **performance**) over the whole
epic diff; the M3-T5 measurement re-run on the final code; flip `VITE_CANVAS_LIVE_FEEDBACK`
to `flagDefaultOn` **only if** the budget holds; keep and pin the flag-off parity suites as
the rollback contract; changeset; PR → CI → merge → release.

## Definition of done

Code · tests (unit + painter + a flag-on Playwright assertion) · docs in lock-step (ADR-0054,
this plan's measurement, `docs/DESIGN_SYSTEM.md` legend entries) · a11y considered (every new
visual has a listbox equivalent already) · performance **measured** · changeset · CI green.
