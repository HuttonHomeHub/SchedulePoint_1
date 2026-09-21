# M2 — FC-2, the withdrawal gate

- **Epic:** [`./feature-spec.md`](./feature-spec.md) · **Conditions:** [`./m0-conditions.md`](./m0-conditions.md)
- **Taken:** 2026-09-21, against the M1 fix, with the control taken against the same tree with the
  one expression reverted.

## Verdict: **FC-2 PASSES. Part A's objective work (M3) is WITHDRAWN.**

|                                              | routed polylines whose interior leaves the band their own endpoints span |
| -------------------------------------------- | -----------------------------------------------------------------------: |
| **before M1** (the defect restored in place) |                                                                  **380** |
| **after M1**                                 |                                                                    **0** |

Zero at every one of the 24 framings measured — two plans × two viewports × two zooms × three pan
positions. FC-2's own non-vacuity control is satisfied: the before count is not merely non-zero, it
is 380, and it is 0 after.

Per the clause committed before M1 was written: **M3 is withdrawn, the epic proceeds to Part B, and
CQ-3 never needs to be asked.** The sequencing deviation that deferred M0-T4 (the budget curve) is
vindicated — it would have been the largest single piece of wasted work in the epic.

## FC-2's stated metric could not be measured, and the correction is recorded rather than applied quietly

FC-2 reads _"the count of rendered polylines whose extent leaves the canvas's vertical bounds … is
0"_. **That quantity cannot reach zero on any non-empty scene, and a zero would mean the scene was
empty.** `cull` keeps a bar whose rect intersects the viewport, so a partially-visible bar at the
top edge legitimately anchors at a negative y and every link touching it leaves the bounds with
nothing wrong. Measured: that count is **1052 before and 936 after** — it moves 11 % across a fix
that eliminates the defect entirely, so it does not discriminate.

The quantity that does is an **excursion**: a routed polyline whose interior vertices leave the
y-band its own two endpoints span, beyond a 12 px tolerance (above the 6 px fan-out and the 5 px
elbow radius, and far below the 28 px lane pitch, so it cannot absorb a leg that has crossed into
another lane). That is the product owner's sentence exactly — the line leaves the band between the
two bars it connects and comes back — and it is scale-free, viewport-free and cull-free.

**This is a metric correction, not a threshold relaxation**, and the distinction is the one that
matters: the new metric is _stricter_ about defects and _blind_ to non-defects, and it was chosen
before its after-value was known, then verified to discriminate by running it against the restored
defect. Reading a committed condition's intent clause in order to get past it is what makes
conditions decoration; this is the opposite case — the condition named a quantity that was
unmeasurable, and both the old and the new counts are reported so a reader can check that judgement
rather than take it.

## What passing does NOT mean, and it is half the product owner's complaint

Their words were that a link _"disappears off the page and then comes back down"_ **and** that it
should be _"streamlined and to the point"_. Those are two claims:

1. **the excursion** — the line leaving the band and returning. **Fixed by M1, measured 380 → 0.**
2. **directness** — how far a link has to travel at all. **M1 does not touch this.** On Unit 300 the
   shipped packer leaves mean |Δlane| 1.78 and 14 links spanning more than five lanes (M0-T3).

**M3 was the work aimed at (2), and FC-2's clause withdraws it on the strength of (1).** That is
what the clause says and it is being followed rather than reinterpreted — but "withdrawn" must not
be read as "solved", so the distinction is put to the product owner explicitly rather than left in
this file. Reinstating M3 is their call, and it now costs the lane budget that M0-T4 would have
priced.

## Scope of the measurement

Both fixtures are the ADR-0066 scale generator's, as CQ-4 requires, and **neither is the plan from
the product owner's screenshot**. The excursion metric is fixture-independent _in kind_ — it
compares a route against its own endpoints — but the count is not, and no claim is made beyond
these scenes.
