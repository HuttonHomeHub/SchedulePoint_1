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

### M3-T5 measurement — the result (2026-07-26)

Harness: `render/paint.dates-budget.test.ts`, the real painter over 2,000 activities (50 lanes ×
40, 5-day bars with 15-day gaps) at 12 px/day into a 1920×1080 viewport, counting-stub context.

| Metric                 | Dates off | Dates on |
| ---------------------- | --------- | -------- |
| Painter time (run 1)   | 3.70 ms   | 4.34 ms  |
| Painter time (run 2)   | 3.79 ms   | 5.67 ms  |
| Extra `fillText` calls | —         | **640**  |

**Outcome: the `Dates` toggle ships DEFAULT-OFF.** Two things the numbers say plainly:

1. Dates are **not free** — 640 extra text draws at 2,000 activities is real work, and in both
   runs the total crossed ADR-0026's 4 ms line.
2. This harness is **not a reliable absolute meter**: the baseline alone measured 3.70–3.79 ms and
   the dates-on figure moved 1.3 ms between identical runs. It counts painter work, not GPU
   rasterisation, under jsdom.

So the measurement cannot _certify_ the budget is held with dates on, and the rule set in
ADR-0054 §3 was that an uncertified budget means default-off. The toggle is there, discoverable
in `View▾`, and a planner who wants dates opts in — a choice, rather than a cost imposed on every
plan. What the measurement **does** certify is that the LOD threshold works: below
`DATE_LABEL_MIN_PX_PER_DAY` the pass adds exactly zero draws and zero measurements.

Re-measure in a real browser before ever revisiting the default.

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

**Outcome (2026-07-26).** `VITE_CANVAS_LIVE_FEEDBACK` flipped to `flagDefaultOn`; the three new
`View▾` toggles (`Dates`, `Float & drift`, `Link slack`) all ship **off** inside it.

The split is deliberate. §1 (ghost fidelity) is gesture-only and §2 (cursor readout) repaints only
the cheap interaction layer, so both are on for everyone — they are the epic's headline answer to
"make manipulation feel live". §3–§5 add per-bar work to the _scene_ layer, and the M3-T5
measurement could not certify the draw budget with them on; the rule set in ADR-0054 §3 was that
an uncertified budget means default-off, and moving that goalpost after the fact would make the
gate decorative. Each is one click away in `View▾`.

A third measurement run during the flip reinforced it: dates off **4.67 ms**, on **9.41 ms** — and
the baseline alone had moved a full millisecond from the earlier runs, which is the harness's noise
speaking as much as the feature's cost. Re-measure in a real browser before revisiting.

**Reviews.** The specialist reviewer agents were not available in this session, so the ux /
accessibility / component / performance passes were done inline against their checklists rather
than by subagent — recorded here plainly rather than claimed as agent-run. Points carried:
non-colour cues on every new mark (hatched tails, dashed guideline), no new pointer-only state
(the a11y listbox already speaks dates and float), no one-off styling (all marks use palette
tokens), and the one continuous cost — a per-move interaction repaint — commented at its call site.

Changeset added; PR → CI → merge → release.

## Definition of done

Code · tests (unit + painter + a flag-on Playwright assertion) · docs in lock-step (ADR-0054,
this plan's measurement, `docs/DESIGN_SYSTEM.md` legend entries) · a11y considered (every new
visual has a listbox equivalent already) · performance **measured** · changeset · CI green.
