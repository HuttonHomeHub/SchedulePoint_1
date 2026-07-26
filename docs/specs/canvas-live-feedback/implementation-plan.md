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

**Read the delta column, not the absolute column.** This harness counts painter work under jsdom
with a stub context — it never rasterises — so its absolute milliseconds are not comparable to
ADR-0026's ≤ 4 ms p95 browser budget. What it measures honestly is the _marginal_ cost of turning
the layer on, because both figures in a row come from the same process moments apart.

| Run              | Dates off | Dates on | **Delta**    |
| ---------------- | --------- | -------- | ------------ |
| 1                | 3.70 ms   | 4.34 ms  | **+0.64 ms** |
| 2                | 3.79 ms   | 5.67 ms  | **+1.88 ms** |
| 3 (at the flip)  | 4.67 ms   | 9.41 ms  | **+4.74 ms** |
| Extra `fillText` | —         | 640      | —            |

**Outcome: the `Dates` toggle ships DEFAULT-OFF.** The delta is the argument:

1. Dates cost between **+17% and +100%** of the whole baseline paint. Even the cheapest run adds
   more than a sixth; the dearest doubles it. 640 extra `fillText` calls at 2,000 activities is
   real, unavoidable work — one string per bar edge, each needing a `measureText` for collision.
2. The delta is not just large but **unstable** — it varied 7× across three identical runs. A cost
   that cannot be pinned down to within an order of magnitude in a stub harness certainly cannot be
   certified against a browser budget.

ADR-0054 §3's rule was that an uncertified budget means default-off, and the delta does not come
close to certifying it. The toggle is discoverable in `View▾`, so a planner who wants dates opts
in — a choice, rather than a cost imposed on every plan. What the measurement **does** certify is
that the LOD threshold works: below `DATE_LABEL_MIN_PX_PER_DAY` the pass adds exactly zero draws
and zero measurements, so the delta is 0.

Re-measure in a real browser (Playwright trace over the same synthetic scene) before ever
revisiting the default — that, not this harness, is what could clear it.

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

The third measurement run happened at the flip and is folded into the M3-T5 table above.

**Reviews (ux, accessibility, component, performance — all four run as subagents).** They found a
real defect that every green check had missed: the `Float & drift` and `Link slack` entries never
reached the `View▾` registry, because the edit that was supposed to add them matched nothing after
Prettier reflowed the array. Both paint passes had shipped **unreachable** — no production code
path could set their scene flags — while the changeset claimed the toggles existed. Types, lint and
every painter unit test passed throughout, since the tests build scenes directly and never go
through the registry. The ux and component reviewers found it independently. Folded, plus a
`tsld-view-toggles.registry.test.ts` that pins the registry's contents so the class of failure
cannot recur silently.

The rest, in the order they were raised:

- **Legend entries** for the tails and the slack chip (ux, blocking) — including the drift row
  naming _when_ drift appears, so its absence in Early mode reads as correct rather than broken.
- **The cursor chip names its datum** (`Start 2 Jan` / `Finish 6 Jan`), and uses the same compact
  date format the flanking labels do rather than a second one a few pixels away (ux).
- **Slack chips anchor per relationship type** — an SS tie's number sits between the two starts,
  an FF tie's between the two finishes — and sit on a plate, since a bare `fillText` landed on
  bars and grid lines with no guaranteed contrast (component).
- **Positive drift is spoken** (`drift 3 days later than its earliest start`) and **per-tie slack
  is spoken** in the Tier-2 `Space` summary, both built from the one shared
  `slackByDependencyId` so the drawn number and the spoken number are the same computation
  (accessibility — WCAG 1.1.1).
- **Hatch strokes are clamped to the viewport** and batched into one path: a 200-day float at day
  zoom is 8,000 px of tail off the side of a 1,920 px screen, and hatching its full length measured
  ~320,000 segments at 2,000 activities — cost scaling with the data instead of the screen
  (performance, blocking).
- **The lane bucket-and-sort is built once** and shared by the label and date passes instead of
  being repeated per frame (performance/component).
- **The cursor-readout work is gated on `editing`**, so a read-only viewer does no per-move work
  (performance).
- **Dates get an opaque plate when the tails are also on**, so the hatch passes behind the text
  instead of through it — the date stays beside the bar edge, which on a time-scaled diagram is the
  only position that is true (ux).

Deferred, with reasons, to `docs/TECH_DEBT.md` #56: moving the pure gesture→overlay helpers out of
`TsldCanvas.tsx`. The finding is right, but it applies to the whole pre-existing cluster; migrating
two of six would make the file less consistent, not more.

Changeset added; PR → CI → merge → release.

## Definition of done

Code · tests (unit + painter + a flag-on Playwright assertion) · docs in lock-step (ADR-0054,
this plan's measurement, `docs/DESIGN_SYSTEM.md` legend entries) · a11y considered (every new
visual has a listbox equivalent already) · performance **measured** · changeset · CI green.
