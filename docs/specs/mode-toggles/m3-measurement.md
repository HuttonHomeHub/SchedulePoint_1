# M3-T4 — The divider, re-measured against the shipped build

**Run 2026-08-30**, Chromium, same harness and same fixture as M0
(`apps/web/measure-toolbar/m0-mode-divider.spec.ts`, plan name
`Riverside Quarter — Phase 2 Substructure`, real project crumb, pen held and re-taken after the
recalculation's reload).

**The shipped figures come first and the prediction second**, because M0's numbers came from an
injected approximation and quoting a prediction as a result is how a measurement stops being one.

---

## The shipped row

| width | container | `headerRowRequired` | `perOccupant.mode` | header `lines` | mode cluster `lines` | `aboveCanvas` |
| ----- | --------- | ------------------- | ------------------ | -------------- | -------------------- | ------------- |
| 1920  | 1888      | 1507                | 456                | **1**          | 1                    | **228.0**     |
| 1646  | 1614      | 1507                | 456                | **1**          | 1                    | **228.0**     |
| 1440  | 1408      | 1507                | 456                | 2              | 1                    | 326.0         |
| 1280  | 1248      | 1507                | 456                | 2              | 1                    | 326.0         |

## Against M0's prediction

| figure                                     | M0 predicted          | shipped               | difference |
| ------------------------------------------ | --------------------- | --------------------- | ---------- |
| `headerRowRequired`                        | 1507                  | 1507                  | **0**      |
| `perOccupant.mode`                         | 456                   | 456                   | **0**      |
| header `lines` (1920 / 1646 / 1440 / 1280) | 1 / 1 / 2 / 2         | 1 / 1 / 2 / 2         | —          |
| `aboveCanvas` (1920 / 1646 / 1440 / 1280)  | 228 / 228 / 326 / 326 | 228 / 228 / 326 / 326 | **0**      |

**Exact, at every width.** The injected approximation and the real second `role="group"` agree to
the pixel, which is what the injection was built to be: `Toolbar.tsx:191-200`'s own classes, applied
to a real div with the pair moved inside it.

## Verdict against `falsification.md`, quoted

> 1. at **1646** and **1920** the live header row is **one line** with the candidate chrome present

**PASS** — 1 line at both.

> 2. `aboveCanvas` with the candidate **equals** `aboveCanvas` without it at 1646 and 1920

**PASS** — 228.0 shipped, 228.0 before the change.

> 3. at **1440** and **1280**, `aboveCanvas` does not grow

**PASS** — 326.0 both, unchanged.

> 4. the mode cluster is **one line** at every measured width

**PASS** — 1 line in all four.

**No revert.** M3-T4's contingency ("if the shipped cost exceeds M0's prediction and breaches the
rule, revert the divider in this milestone rather than deferring it") does not fire.

---

## One thing to know before re-running this harness

**The probe now double-injects.** Its "candidate" column adds a divider to a row that already has
one, so its `+13` delta is the cost of a _second_ boundary rather than of this change. That is not a
defect and it is left as it is — the reading is still meaningful (a second segment on this row would
cost 13 px and still not wrap, which is the headroom question anyone extending the row will ask) —
but a later reader who mistakes it for this epic's delta would double-count. The **baseline** column
is the shipped state from M3 onwards.

## What the run of eight contradicted width expectations looks like from here

ADR-0090 M4 through ADR-0115 is eight consecutive epics whose width expectation its own measurement
contradicted, always in the same direction. This one held — and the honest version is narrower than
"the streak is broken":

- The **prediction was contradicted once**, on the first run, by my own instrument rather than by the
  layout (`m0-measurement.md` records it: +5 px against +13, because the chrome was applied to a
  button whose `px-2` the inline `padding-left` replaced).
- It held **once the instrument was corrected**, and the reason is specific rather than general: the
  row's slack at 1646 is 107 px (1614 − 1507), an order of magnitude more than the change, and the
  two widths where slack is negative were already wrapping before it.

The prior that 13 px on this row is not free was reasonable and was wrong here. It was wrong for a
checkable reason, which is the only kind worth recording.

---

# Re-measured after the M4 gate pass (2026-08-30)

The ux gate found the visible `MODE` caption asserting the single umbrella this change removes, and
it was deleted (ADR-0119 D7). That changes the row's width, so the figures above are re-derived
rather than carried:

| width | container | `headerRowRequired` | `perOccupant.mode` | header `lines` | `aboveCanvas` |
| ----- | --------- | ------------------- | ------------------ | -------------- | ------------- |
| 1920  | 1888      | **1468**            | **417**            | 1              | 228.0         |
| 1646  | 1614      | **1468**            | **417**            | 1              | 228.0         |
| 1440  | 1408      | **1468**            | **417**            | 2              | 326.0         |
| 1280  | 1248      | **1468**            | **417**            | 2              | 326.0         |

**The caption cost 39 px** (1507 → 1468 required; 456 → 417 for the cluster), so slack at 1646 goes
107 → **146 px**. Every clause of `falsification.md` still passes, and `aboveCanvas` is untouched at
all four widths.

**39 px bought no line, and that is the expected shape rather than a disappointment.** At 1440 the
row needs 1468 against a 1408 container, so it was over by 99 px and is now over by 60 — still two
lines. A wrapping row breaks **between items**, not by total width; ADR-0114 records freeing 164 px
and gaining zero height for the same reason. The gain here is slack, which is what protects the row
against the next thing added to it.

**What this does NOT change:** the divider's own cost is still +13 px, measured identically before
and after the caption went. The two changes are independent, and the probe's candidate column
(which now double-injects) still reports 13.
