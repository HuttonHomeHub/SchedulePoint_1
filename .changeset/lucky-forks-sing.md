---
'@repo/api': minor
'@repo/types': minor
---

Compute and expose remaining float: the float a hand-placed bar has not already spent.

`totalFloat` is measured from the pure-network early finish, so once a planner places a bar the room
it still has is `totalFloat − drift`. The engine now emits that in working minutes and the
recalculation's batched write converts it **once**, on the activity's own calendar, into
`activities.remaining_float`. It is exposed as `remainingFloat` on the activity response and is
withheld from the guest share scope, like its two ADR-0033 neighbours.

**The single rounding is the whole feature.** A client subtracting the two day-denominated columns
computes `round(T/f) − round(d/f)`, and that is not `round((T − d)/f)` wherever the drift is not a
whole multiple of the activity's hours-per-day — which a sub-day duration makes ordinary, because a
successor of a four-hour task starts half an eight-hour day in. On a critical bar nudged a day and a
half, the naive form reports two days past its float and the correct one reports one. No client can
compute the right answer at all: minutes are persisted for neither input.

Negative is the feature, not an error. A bar placed past what its own float allows has negative
remaining float, and that is exactly what it is for; there is no CHECK constraint refusing it.

Nothing reads it yet — no screen, no column, no lens. The pure forward and backward passes are
untouched, so early and late dates, float, criticality and the project finish are byte-identical.
