---
'@repo/api': minor
---

Stop levelling from reserving a resource for days it never takes

The levelling pass held a resource for the **whole** of an activity, so a crew that only joins on day
three was nevertheless reserved from day one. Anything else needing that resource was pushed out for
capacity nobody was using — safe, but pessimistic, and it produced a levelled programme longer than
the resources actually require.

With a stored join lag (ADR-0071 §1) the pass now demands each resource only over
`[start + lag, finish)` on the activity's own calendar. A lag at or past the span reserves nothing at
all, which is the honest reading of a window with no working time in it.

The placement search had to change with it. One merged feasible/blackout timeline could answer for
every resource on an activity while they all shared the activity's span; once two resources on one
activity ask about **different** windows, it cannot. The search now works on per-resource candidate
starts — the earliest start, plus each blackout end translated back by that resource's own lag — and
takes the first that clears every resource's own window. Termination is still inherent (the largest
candidate lies past every blackout) and the `O(k log k)` bound is preserved.

**ADR-0041's parity argument is restated rather than repeated, and that is the substantive part.** It
was one sentence; it is now two claims of different strength. Gate A — with `levelResources` off the
pass never runs and the lag is never loaded — is unchanged and still structural. Gate B — with
levelling on and every lag zero, output is byte-identical to before — is **no longer structurally
impossible to break**, because both the occupancy model and the search were rewritten. It is held
instead by a corpus of snapshots captured **before** `level.ts` was touched, across the eight shapes
the pass branches on. A snapshot taken afterwards would have asserted the refactor against itself.

The `O(k log k)` boundedness now has a calendar-port **call-count** gate beside the wall-clock assert:
a candidate list that grew with the span rather than with the placed intervals would still be correct,
still pass every behavioural test, and quietly reintroduce the per-minute scan ADR-0041 §F forbids.
Measured 477 calls unlagged and 634 lagged over 40 contending activities, against ~1,600 for quadratic
and ~57,600 for a per-minute scan.

**`computeSchedule` is not modified and the ADR-0034 recalculation parity gate is untouched** — the
CPM network pass has never seen an assignment.
