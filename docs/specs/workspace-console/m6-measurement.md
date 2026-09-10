# M6 — the captions go, and what that bought

**Status:** Approved

Taken in Chromium on the real product, through `e2e-workspace-fit`'s own config so the flag pins
apply (ADR-0099's recorded trap: a dev server started by hand runs a different environment and the
reading means nothing). Fixture: a two-activity plan named `Riverside Quarter — Phase 2
Substructure`, pen held, schedule computed. Probe deleted after the run.

## The readings

| width | band (M5) | band (M6) | foot | deck lines (M5) | deck lines (M6) |
| ----- | --------- | --------- | ---- | --------------- | --------------- |
| 1920  | 143       | **139**   | 51   | 2 (1 + 1)       | 2 (1 + 1)       |
| 1646  | 143       | **139**   | 51   | 2 (1 + 1)       | 2 (1 + 1)       |
| 1440  | 143       | **139**   | 51   | 2 (1 + 1)       | 2 (1 + 1)       |
| 1280  | 279       | **231**   | 51   | **4** (2 + 2)   | **3** (2 + 1)   |

**F1 met**: band ≤ 145 at 1646 and 1920 — 139, four under the plan's own 141 target.
**F7 met**: the foot row is 51 px, its stated bar exactly.

## What the 1280 column is actually about, and it is not the pen

M5 put the pen at the head of the DO row and the deck went to four lines at 1280, against a bound
of three. The obvious reading is that a twelfth control broke the row. **Measured, that reading is
wrong**: at 1280 the DO row's twelve commands sum **1069 px inside a 1264 px container** — they fit
with 195 px to spare — and the row wrapped anyway.

The overflow was the chrome. Two caption spans on that row, each with its `pr-2`, its `border-r`
and a gap either side; the same again on LOOK. **The captions cost the DO row more than the control
the previous milestone added to it**, which is why deleting them does not merely recover the line —
it takes the row from two lines back to one while the pen stays.

That is the epic's own argument arriving as a number rather than a claim: the rows became the
grouping at M4, so the words naming the groups were paying rent twice.

## What M6 did not buy

**1280 is still three lines, because LOOK is still two.** The bound permits it and this is not a
regression, but it is worth stating rather than letting the green tick imply the row is comfortable
there: LOOK carries the View and Find cards and wraps at that width with or without its captions.
The deck's own line arithmetic at 1280 is the thing that would need to change to fix it, and no
milestone in this epic proposes to.

**The band at 1280 is 231 px, not 139.** Three lines instead of two. The 145 bar is stated for 1646
and 1920 — the widths this epic is judged on — and 1280 has never been inside it.

## The four pixels

`py-1.5` → `py-1` on the deck's wrapper, and the foot row following it by the rule already written
in `activity-bottom-panel.tsx`: its inset **copies** the deck's rather than judging its own, so the
two cannot part company. Worth exactly 4 px of band (2 px top, 2 px bottom), which is the whole
difference between 143 and 139 at the wide widths — the captions' width bought the 1280 line, and
the inset bought the height.
