# The one-row header — falsification condition, written before the measurement

> **Status:** condition fixed 2026-08-26, **before** the repaired instrument was run.
> Recorded here because this decision has been costed four times and withdrawn three, and every
> withdrawal came from a number. The point of writing the condition first is that the number cannot
> then be chosen to suit the answer.

## The requirement

The product owner, on `web-v0.103.0`: _"The header being split over two rows … needs to fit on one
line without question."_ It is the firmest of the three complaints they raised, and the only one
still unfixed.

## Why the previous costings cannot be reused

ADR-0110 D3 withdrew the merge on "**536 px short at 1440** in the worst pen state". That figure
rests on `m0-merged-row`'s `headerInk`, and **that field was measuring the wrong thing**: `inkOf`
returned `max(right) − min(left)` over leaf rectangles, which for a `justify-between` row counts the
**empty middle** as content. It reported 1215 against a 1222 px container at 1280 and 1855 against
1862 at 1920 — a measure of the row, not of what is in it (`docs/TECH_DEBT.md` #198).

The instrument is repaired first (covered extent, overlaps merged), and both figures are now
emitted: `headerInk` (content) and `headerSpan` (the old track measure, under a name that says so).
**No number from before 2026-08-26 is carried into this decision.**

## What is being asked

Can the identity row and the mode row become **one row** that fits its container, at every width
this product is judged at, **in the worst pen state**?

The occupants, and where each figure comes from:

| Occupant                                         | Source                                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| brand + organisation switcher + account          | `headerCells[].ink`                                                                |
| breadcrumb (plan path)                           | `breadcrumb.ink`                                                                   |
| mode cluster (`Early｜Visual`, `Diagram｜Gantt`) | `modeCluster`                                                                      |
| pen furniture (chip, button, gaps)               | `pen.furniture`                                                                    |
| pen sentence                                     | `pen.states[worst]`                                                                |
| inter-element gaps                               | **must be measured, not assumed** — the previous costings did not account for them |

## The condition

**PROCEED** only if, with the repaired instrument, at **every** width in {1280, 1440, 1646, 1920}:

> `container − (sum of occupant ink + measured gaps)` **≥ +120 px** in the **worst** pen state.

**WITHDRAW** otherwise, and record the arithmetic.

**1646 is not optional.** It is the product owner's Surface Pro width, and ADR-0091's retrospective
records that two epics measured 1920/1440/1024/768 and never the width the product is actually
judged at. A result that fits at 1920 and fails at 1646 is a withdrawal.

**+120 px, not 0.** A row that fits exactly is a row that overflows on the first longer plan name, a
longer organisation name, or a translated string. ADR-0091 M7 measured a real plan name at **227 px**
against the 37 px placeholder its harness had used, and that single substitution is what turned a
"307 px of slack, PROCEED" into an overflow.

## The worst pen state, named in advance

`heldByOtherAdmin` — an Org Admin viewing a plan someone else holds — measured at **432 px**. It is
the worst of ten. It is not an edge case to be excused: in **eight of ten** lock states the sentence
is the only thing on screen naming who holds the pen.

## The re-scope, and what it would cost

The merge is expected to fit only if the **pen sentence moves off the identity row** (worth about
+130 px at 1440 on the pre-repair figures — itself now suspect and to be re-derived).

If the condition passes only with that re-scope, then it is a **different decision** and is put to
the product owner as one, because it changes where the pen model speaks. ADR-0110 D3 already
recorded that it "belongs to a milestone with that as its subject".

## What would make me wrong

Stated so a reader can check rather than trust:

1. If the repaired `headerInk` comes back within a few px of `headerSpan` on the header row, then the
   gap I believe it was counting is not there, the old figures were sound, and #198 is overstated.
2. If the shortfall is constant across widths, the "may vary by width" expectation in #198 is wrong.
3. If measured gaps turn out to dominate the occupant ink, then this whole per-occupant approach is
   the wrong frame and the honest instrument is a shrink-to-fit probe instead.

---

# Result — measured 2026-08-26T09:21Z with the repaired instrument

## Hypothesis 1 was mine, it was named in advance, and it is FALSIFIED

I predicted `headerInk` would fall well below `headerSpan` once the empty middle stopped being
counted. It did not:

| width | container | `headerInk` (covered) | `headerSpan` (old) |
| ----- | --------- | --------------------- | ------------------ |
| 1280  | 1222      | **1222**              | 1215               |
| 1440  | 1382      | **1382**              | 1375               |
| 1646  | 1588      | **1588**              | 1581               |
| 1920  | 1862      | **1862**              | 1855               |

Covered extent came back **equal to the container** — slightly _above_ the span. So the header row
has no empty middle: its leaf rectangles tile the full width. **`#198` as I first framed it is
overstated, and the correction matters more than the finding.** `inkOf` was not counting a gap
between two clusters; it was counting **stretched, non-inking leaves** — a `flex-1` wrapper with no
children is a leaf with width and height, and it covers everything under it. Span and covered extent
agree here precisely because something spans the row either way.

What the repair _did_ change is the figure for each **occupant**, and those are the numbers the
decision needs. Every one came down:

| occupant                             | before repair | after   |
| ------------------------------------ | ------------- | ------- |
| header cells (brand + org + account) | 374           | **358** |
| breadcrumb                           | 424           | **388** |
| mode cluster                         | 435           | **313** |
| pen furniture                        | 173           | **157** |

So the instrument was worth repairing, for a different reason than I gave.

## The verdict against the condition

Occupants sum to **1648 px at every width** (constant content, growing container), in the
`heldByOtherAdmin` pen state at 432 px. **Inter-element gaps are still not measured**, so every
figure below is a _best case_:

| width | container | occupants | slack    | bar  | verdict  |
| ----- | --------- | --------- | -------- | ---- | -------- |
| 1280  | 1222      | 1648      | **−426** | +120 | **FAIL** |
| 1440  | 1382      | 1648      | **−266** | +120 | **FAIL** |
| 1646  | 1588      | 1648      | **−60**  | +120 | **FAIL** |
| 1920  | 1862      | 1648      | +214     | +120 | pass     |

**WITHDRAWN.** The merge fails at three of four widths, including 1646 — the width the product is
judged at — before gaps are counted at all.

**But it is much closer than the withdrawn figure suggested.** ADR-0110 D3 recorded "536 px short at
1440"; measured honestly it is **266**, and at 1646 it is **60**. That earlier number was inflated by
the same instrument defect, so the third withdrawal was right for a wrong reason.

## The re-scope, priced

Moving the pen sentence off the identity row removes 432 px, leaving occupants at **1216**:

| width | container | slack without the pen sentence | bar  |                |
| ----- | --------- | ------------------------------ | ---- | -------------- |
| 1280  | 1222      | **+6**                         | +120 | fails          |
| 1440  | 1382      | **+166**                       | +120 | passes, thinly |
| 1646  | 1588      | **+372**                       | +120 | passes         |
| 1920  | 1862      | **+646**                       | +120 | passes         |

So the merge is feasible at **1440 and above** if the pen sentence moves, and **not at 1280**.

**Two caveats, and neither is decoration.** Gaps are unmeasured, and at 1440 there are only 46 px of
headroom over the bar — a handful of flex gaps would take it. And this is a **different decision**
from the one asked for: it changes where the pen model speaks, in the eight of ten lock states where
that sentence is the only thing naming who holds the pen. That is the product owner's call, not a
measurement's.

## Hypothesis 2

"If the shortfall is constant across widths, the expectation that it varies is wrong." The shortfall
does vary — but only because the container grows while the content does not, which is arithmetic
rather than insight. Recorded so the next reader does not mistake it for a finding.
