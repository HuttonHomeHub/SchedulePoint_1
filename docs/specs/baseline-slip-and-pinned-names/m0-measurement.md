# M0 measurement: what the baseline slip costs the bottom bar

- **Harness:** `apps/web/measure-toolbar/baseline-slip-m0.spec.ts`, run 2026-11-14 on the product build, headless
  Chromium; raw readings in `apps/web/measure-output/baseline-slip-m0-{mouse,finger}.json` (not committed).
- **Method (ADR-0142, ADR-0128).** Machine-independent: every verdict is one cell read with and without the fact, on
  the same machine, never a pixel figure against a constant. A cell is a state x a window; the states are nothing
  selected, a single selection, the plural bar, an armed Select, a stale sentence and a stale sentence with a
  selection; the windows are 1024x600, 1024x768, 1280x720 and 1366x768; mouse and finger. "Free" means the diagram's
  height and the dock's line count are equal, nothing is cut off, every foot-row button answers a pointer at its centre
  and the page does not scroll sideways. The layout is settled (four identical samples) before every reading, and the
  fact-absent reading is taken twice per cell; a cell whose two absent readings differ fails the run.
- **Two phases.** Phase 1 (no baseline): the worst realistic sentence ("12 working days earlier than baseline") is
  cloned from the real Finish fact into the dates row, then the population row, so it measures what the fact would
  cost if it never stepped aside. Phase 2 (an active baseline): the shipped fact, with its yield.

## Phase 1: the fact unyielded (the reading that fired the stop rule)

| Pointer | Cells | Cells where the fact costs the diagram | Gating cells | Gating cells that cost |
| ------- | ----- | -------------------------------------- | ------------ | ---------------------- |
| mouse   | 24    | 11                                     | 13           | 7                      |
| finger  | 24    | 9                                      | 0 (recorded) | n/a                    |

- Costs fall in three groups: the **stale sentence** (the facts wrap and the foot row grows by one line, at 1024
  wide), a **docked strip** (the dock wraps its own items), and an **armed tool**. The idle row (nothing selected, a
  current schedule) was free in every window, mouse and finger.
- The population row costs in exactly the same cells as the dates row, so there is no cheaper row to move it to
  (section 4.3's second fallback is closed).
- **Some cells got taller with the fact** (for example single selection at 1024x768 read 454 to 494 px, dock lines
  4 to 2). The first run suspected a confound, so the harness now settles first and reads the absent state twice; the
  readings were unchanged and every cell reproduces, so these are real: the toolbar and dock re-fit from their own
  observers (ADR-0185), and adding width to the row can tip them into a different, sometimes shorter, arrangement.
  That is a property of the existing layout, not a benefit of the fact, and it is a second reason not to let the fact
  decide the layout.
- **Stop rule: fired.** The owner chose "show it only when it fits" (2026-11-14).

## Phase 2: the shipped fact (`BASELINE_SLIP_YIELD`)

The fact steps aside (`sr-only`, still in the accessibility tree) whenever the dock outlet holds something or the
schedule is not `current`.

| Pointer | Cells | Fact shown | Fact yielded | Cells that cost the diagram | Unreproducible cells |
| ------- | ----- | ---------- | ------------ | --------------------------- | -------------------- |
| mouse   | 24    | 4          | 20           | 0                           | 0                    |
| finger  | 24    | 4          | 20           | 0                           | 0                    |

- **Shown in all four idle cells** (nothing selected, a current schedule, every window), **free** in each.
- **Yielded in every other cell**, including the wide windows where it would have fitted beside a strip or a stale
  sentence. That is the price of declaring the rule in CSS on the foot row rather than measuring the row's width (a
  measurement here feeds the row's own width back in as an input, the defect `no-resize-observer.structural` guards).
- Nothing cut off, every button pressable, no sideways page scroll in any cell.
- **Verdict: the stop rule passes for the right reason.** The diagram never pays for the fact, and the fact is on
  screen exactly where the reader is looking at the plan with nothing else on the bar.
