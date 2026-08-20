# Graphite M5 — the single command strip: design, and the measurement that must come first

**Status:** design · **ADR:** [ADR-0099](../../adr/0099-graphite-the-workstation-in-rail-chrome.md) D3

## The shape

Three command rows above the stage become **one**:

| Today (after M4)                      | After M5              |
| ------------------------------------- | --------------------- |
| identity + mode segments + pen status | identity + pen status |
| Row 1 — `View and navigate`           | **one strip**         |
| Row 2 — `Build and manage`            | —                     |

- `ToolbarRow` goes `'mode' \| 'look' \| 'do'` → `'mode' \| 'strip'`; `look` and `do` merge.
- The four **mode segments move to the rail** — ADR-0091's own thesis is that a mode is not a
  command, and the rail is now the leading-edge cluster where a mode belongs. **−400 px**, a quarter
  of the available width at 1646 spent on things that are not commands.
- **Calendar · Analysis · Comments · Share · Print fold into one `Plan ▾`** — five document-level
  commands used occasionally, behind one trigger. **−283 px net.**
- `search` stays an **inline field at full width**. The UX review's B10 is explicit that collapsing
  the product's highest-frequency find affordance into a popover is a click-cost regression, and the
  reduced strip does not need the width.

**The modes stay registry items on the rail, never hand-rolled buttons.** plan.md §E names this:
the five modal tools need arm/disarm, Escape precedence, announcement and pen gating, and the
registry already gives all five. Hand-rolling is how one control gets a rule and its neighbour does
not — the ADR-0064 §7 shape, recorded four times in this register.

## The claim that has not been measured, and must be before anything is deleted

ADR-0099's Consequences say the width ladder, the band floors, the hysteresis,
`CHROME_RESIDUAL_PX` and the `⋯` overflow "become unnecessary and are deleted with the row they
served".

**M0 measured 1920, 1646, 1440 and 1280. `e2e-toolbar-fit` targets 960 and 768 as well.**
Extrapolating from M0's own figures, the reduced strip is ~1052 px against ~912 px available at 960
— i.e. it does **not** fit, and deleting the overflow there would reproduce the ADR-0090 defect this
whole epic was opened on: controls painted at 0 px, pointer-unreachable, with no `⋯` to reach them
through. That is a WCAG 2.5.8 failure with no exception available.

So **M5-T1 is a measurement, not an implementation**: extend `graphite-strip.spec.ts` to 1024, 960
and 768 and read the answer. Three outcomes, decided in advance so the result cannot be rationalised
after the fact:

1. **Fits at every width** — the ladder goes, exactly as ADR-0099 says.
2. **Fits down to some width W and not below** — the ladder is **kept below W and deleted above
   it**, and ADR-0099's Consequences are corrected in the same commit rather than left reading as
   though the deletion were total.
3. **Does not fit at 1280** — the strip narrows further before anything is deleted. It is not
   shaved for a seventh epic.

This is the sixth consecutive epic in the register whose width expectation was contradicted by its
own measurement, and M0 was the first to catch it before building. Extending that habit one rung
down costs one harness run.

## What M5 does NOT do

- **`finish-chip` stays in the strip.** ADR-0099 D4 moves it to the status bar and M0 counts −127 px
  for that, but the status bar is **M7**. Moving it now would strand a read-out with nowhere to go;
  keeping it costs 127 px against 490 px of measured slack at 1646. M7 removes it and re-measures.
- **The identity row stays.** The strip's own measured width plus the identity block (~394 px at
  1920, more with a real 62-character plan name) is ~1504 px against 1394 px available at 1440 —
  it does not fit, so folding identity into the strip is not available and is not attempted. Two
  bands above the stage is the honest outcome, down from three.

## Gates

`e2e-toolbar-fit` is **rewritten, not retired** — S4 (the row fits as laid out), S3 (no command has
no route), S11 (a trigger's density matches its band) and the coarse-pointer sweep all still have
subjects; what goes is every assertion about the `⋯`, which will not exist above W. The
band-width assertion M4 added is untouched: it is about the band, not its contents.

ADR-0079's Escape target guard is re-asserted, because merging two rows re-enters the code that
owns it.
