---
'@repo/api': minor
'@repo/types': minor
---

Freeze per-assignment cost in a baseline, so a lagged planned value is exact

A cost baseline froze **one number per activity**. That is enough to time-phase a whole activity's
cost and not enough to time-phase it **per resource** — which is what a per-assignment join lag asks
for, because a crane arriving on day four spends its share of the money over a different window from
the crew that started on day one. Splitting a frozen total by **live** budget shares reallocates
committed money using a mix that has changed since the commitment.

Capturing a baseline now also records, per active assignment, its resolved budgeted cost **and its
join lag at capture**. The lag is frozen for the same reason the cost is: a snapshot holding frozen
money while reading the live lag would phase committed cost through a window somebody edited
afterwards. The components come from the same expression that sums the activity total, so the
decomposition adds up to its own total by construction rather than by two spellings agreeing.

**Baselines captured before this cannot be back-filled** — a breakdown that was never recorded is not
recoverable from a frozen total. Those keep the approximate split for the life of the baseline, and
the Earned-Value response now says so: the new `costPhasingApproximatedCount` counts the activities
whose lagged split was approximated rather than read from the baseline's own breakdown, and
re-capturing the baseline is what clears it. It is `0` when there is no cost baseline at all, because
a live-budget planned value has nothing to approximate.

Which path a baseline is on is read from a stored discriminator and never inferred from whether
component rows exist: an assignment-free plan's baseline has zero component rows and is nonetheless
exact, while a pre-feature baseline has zero rows and can only be approximated — the same observation
with opposite answers. Capturing components does not by itself move any planned value; a baseline
whose components all joined with their activity is byte-identical to before.
