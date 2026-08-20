# Graphite M0 — does the single command strip fit?

**Run 2026-08-19.** Harness: `apps/web/measure-toolbar/graphite-strip.spec.ts`. Composes the
proposed strip by **cloning the real rendered controls** out of the live toolbar into one flex
row — not by summing estimates, which is the mistake `CHROME_RESIDUAL_PX` was invented to
paper over and then found miscalibrated against (ADR-0091 M7).

Worst case measured deliberately: a real 62-character construction plan name, and the
project-finish read-out in its **resolved** state. ADR-0097's closure harness reported 307 px
of slack and a PROCEED because its first run used a 37 px plan name.

## Verdict: NO. The strip as drawn does not fit at any width.

| Viewport | Available | As drawn (icon-only) |    Slack | Fits   |
| -------: | --------: | -------------------: | -------: | :----- |
|     1920 |      1874 |                 1948 |  **−74** | no     |
| **1646** |  **1600** |             **1902** | **−302** | **no** |
|     1440 |      1394 |                 1918 |     −524 | no     |
|     1280 |      1234 |                 1844 |     −610 | no     |

The labelled variant — today's controls unchanged — is 900–1060 px over, so the mockup's
icon-only treatment was necessary and nowhere near sufficient.

**This is the sixth consecutive epic in this register whose width expectation was contradicted
by its own measurement**, and the first where it was caught before anything was built. The
mockup was drawn without measuring; M0 exists because the strip deletes the `⋯` that made the
previous five embarrassing rather than broken.

## Where the width actually goes

Icon-only at 1646, widest first. The fifteen icon buttons are not the problem — they total
about 570 px. Ten labelled controls carry the rest.

| Control          | Width |                  |
| ---------------- | ----: | ---------------- |
| `search`         | 240.0 | inline field     |
| `export` (Share) | 157.5 | labelled trigger |
| `finish-chip`    | 126.6 | read-out         |
| `mode-visual`    | 119.2 | mode segment     |
| `analysis`       | 114.0 | labelled trigger |
| `mode-early`     | 112.8 | mode segment     |
| `view-tsld`      |  93.1 | mode segment     |
| `filter`         |  92.5 | labelled trigger |
| `view`           |  89.4 | labelled trigger |
| `view-gantt`     |  74.9 | mode segment     |

**The four mode segments alone are 400 px** — a quarter of the available width at 1646, spent
on things that are not commands.

## The fix, measured rather than proposed

Three moves, each justified by what the thing _is_ rather than by width:

1. **The four mode segments leave the strip for the RAIL.** ADR-0091's own thesis is that a
   mode is not a command. They were on the strip because the old shape had nowhere else; the
   rail is now the leading-edge cluster and is where a mode belongs. **−400 px.**
2. **The project-finish read-out leaves the strip for the STATUS BAR.** ADR-0099 D4 already
   says the status bar carries facts. This is a fact. **−127 px.**
3. **Calendar · Analysis · Comments · Share · Print fold into one `Plan ▾` menu.** Five
   document-level commands used occasionally, behind one trigger. **−283 px net.**

`search` stays an inline field at full width — the UX review's B10 is explicit that collapsing
the product's highest-frequency find affordance into a popover is a click-cost regression, and
the reduced strip does not need it.

| Viewport | Available | Reduced strip |      Slack | Fits    |
| -------: | --------: | ------------: | ---------: | :------ |
|     1920 |      1874 |        1155.9 |     +718.1 | yes     |
| **1646** |  **1600** |    **1109.9** | **+490.1** | **yes** |
|     1440 |      1394 |        1125.9 |     +268.1 | yes     |
|     1280 |      1234 |        1051.9 |     +182.1 | yes     |

Fits at every measured width with 182–718 px of slack — enough that the ladder can be deleted
without a successor, which was M0's actual question.

## Caveats, stated

- The reduced figures are computed from the same per-item measurements, not from a second
  browser run of the reduced strip. **Re-measure once the strip is built** — that is M5's own
  gate, not this document's claim.
- Three ids were absent from the live toolbar at some widths (`zoom`, `baseline-overlay`,
  `over-allocation`) because they were already demoted into the `⋯` at that width. They are
  charged at their measured width where present; at 1280 the total is charged over 22 found
  items rather than 24, so **1280 is very slightly optimistic**. The 182 px of slack absorbs
  it.
- `level-resources` and `print` do not exist yet and are charged at a measured icon width.
