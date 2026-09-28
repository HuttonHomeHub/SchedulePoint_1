# M0 conditions — committed before the harness

- **Committed at:** `main` `202da93a21f8d6989764194845268682d192b7fb`.
- **Source:** [`feature-spec.md`](./feature-spec.md) §4.8, copied verbatim. This file precedes any
  harness code in `git log` — that ordering is SC-6's evidence and ADR-0128's ordering (a bar is
  never argued with once the numbers arrive).

---

## Environment

Production build. Viewports 1646×1097 @ DPR 1.75 and 1920×1080 @ DPR 1. Plans `scale-500` and
`scale-2000`, recalculated. Panel at its default 280 px. 7 repeats per limb. CPU 1× judged and 4×
`REPORTED_ONLY`. The header records commit, Chromium version, headless flag,
`navigator.hardwareConcurrency`, viewport, DPR and rendered row count.

## Limbs

| Limb                      | Measure                                                                                                                                                                                                                 | Bar (source)                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **E1** expand             | Event Timing `duration` of the `Expand activities panel` click. This includes presentation to the next paint, and so covers the synchronous mount of every row                                                          | ≤ 200 ms: CWV "good" INP (CLAUDE.md §15)                                 |
| **S1** scroll             | Mean fps and dropped-frame % from rAF intervals across a 3 s `Input.synthesizeScrollGesture` over the scroller, with long tasks recorded                                                                                | ≥ 45 fps @ 500, ≥ 30 fps @ 2,000 (ADR-0026 §9, the same surface's floor) |
| **I2** checkbox           | Event Timing on a row checkbox toggle at row ≈ N/2                                                                                                                                                                      | ≤ 200 ms                                                                 |
| **I3** row menu           | Event Timing on `Actions for <name>` at row ≈ N/2                                                                                                                                                                       | ≤ 200 ms                                                                 |
| **I4** canvas selection   | Event Timing on ArrowDown in the diagram's activity listbox (`TsldPanel.tsx:3444-3466`), panel **expanded**. The same measure with the panel **collapsed** is the control, and the delta is reported as the panel's tax | ≤ 200 ms absolute. The delta is `REPORTED_ONLY`                          |
| **N1** narrow open        | Workspace-open long-task total at 390×844 with the hidden pane mounted (cost path 3)                                                                                                                                    | `REPORTED_ONLY`                                                          |
| **A** attribution         | CDP `Performance.getMetrics` deltas (`ScriptDuration`, `LayoutDuration`, `RecalcStyleDuration`) around each limb                                                                                                        | `REPORTED_ONLY`. It chooses the remedy family, and never a verdict       |
| **X** horizontal overflow | Region `scrollWidth` against `clientWidth` at 1280, 1646 and 1920                                                                                                                                                       | Fact, recorded                                                           |

## Verdict rule

Uses ADR-0128 D4's four values. `PASS` or `FAIL` when the 7-run range lies wholly on one side of the
bar. `INDETERMINATE` when the range straddles the bar, or when the spread exceeds 50 % of the bar.
The judge **throws** on any non-vacuity failure (below).

## Non-vacuity refusals

| Scenario                                                                                  | Detection                                      | Result                                                                                            |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| M0 harness pointed at the Vite **dev** server                                             | The page loads `/@vite/client`                 | The harness **throws**. React's development build is not what ships, and a number from it is void |
| M0 plan not recalculated (the scale tier lands uncalculated, `docs/TEST_PLAYBOOK.md:232`) | Every `Float left` cell is `—`                 | The harness **throws** rather than measuring a cheaper table than a real one                      |
| Rendered row count ≠ plan row count                                                       | `tbody tr` count against the API's list length | The harness **throws** (non-vacuity: it would not be measuring the un-virtualized table)          |
| Repeat spread straddles a bar                                                             | Judge                                          | `INDETERMINATE`, and CQ-A fires                                                                   |

## Honest limits (stated here, not discovered later)

S1's rAF pacing is a main-thread proxy. A PASS shows the main thread is free during scroll. It does
**not** show there is no checkerboarding, which a headless rasteriser cannot observe (ADR-0128 D1).
The container's CPU relative to the product owner's Surface Pro is **unknown**, and that is why the
spread limb exists. D1's disqualification was measured for Canvas 2D rasterisation. DOM scripting
and layout are CPU-bound, so that finding is expected to transfer less, but this is **reasoned, not
established**, and the spread settles it.

## Committed prediction (so it can be wrong)

At 2,000 rows, S1 passes, because there are no scroll listeners today, and E1 fails. I2, I3 and I4
are genuinely unknown. The measured slope between 500 and 2,000 is the effect-size estimate for
windowing, which would render about 30 rows whatever the plan size, so M3's benefit is predicted
before M3 is built (ADR-0142 D4).

## Decision table (arms the remedy milestones; nobody re-argues it afterwards)

| M0 outcome at 2,000 rows, 1× CPU                 | Next                                                                                                                                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every judged limb PASS                           | **M1 only.** #334 closes with the numbers. M2 and M3 are recorded as _not armed, on measurement_                                                                                  |
| E1 and S1 PASS, and any of I2/I3/I4 FAIL         | **M1, then M2** (render isolation), then re-measure. M3 is armed only if a limb still FAILs after M2                                                                              |
| E1 FAIL or S1 FAIL                               | **M1, then M3** (windowing, **ADR first**, CQ-B). M2 as well if I4 FAILs, because windowing reduces rows re-rendered but does not stop the panel re-rendering on canvas selection |
| Any judged limb INDETERMINATE                    | **M1 only, then stop.** CQ-A goes to the product owner with the numbers                                                                                                           |
| Only 500-row limbs or `REPORTED_ONLY` limbs fail | Not reachable for 500 without 2,000 also failing. `REPORTED_ONLY` limbs arm nothing and are recorded                                                                              |

---

## Status

**Not yet run.** `apps/web/scripts/measure-activities-panel.mjs` exists (M0-T2) with its judge
verified against named mutations (`measure-activities-panel.judge.test.mjs`), but M0-T3's reading
requires the shared database and API this session does not have exclusive access to. See
`apps/web/scripts/measure-activities-panel.mjs`'s own header for the exact invocation. Once a
reading is taken, it is recorded in `m0-measurement.md` beside this file, and the decision table
above is applied to it mechanically — never re-argued.
