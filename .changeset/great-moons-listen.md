---
'@repo/api': minor
'@repo/types': minor
'@repo/web': minor
---

Detect and report the other side of a placement conflict: a bar placed PAST an explicit bound.

`activities.visual_conflict` has fired for one condition since it shipped — `placed < logicEarliest`
— so a hand-placed bar sitting past a `START_NO_LATER_THAN`, `FINISH_NO_LATER_THAN`,
`MANDATORY_START` or `MANDATORY_FINISH` ceiling was not a conflict at all. The engine now derives
that flag from a new nullable `visualConflictReason` (`EARLIER_THAN_LOGIC` / `LATER_THAN_BOUND`),
exposed on the activity response and withheld from the guest share scope.

**This is a live change, not a dark one.** `VITE_SCHEDULING_MODES` is default-on, so on any plan in
Visual mode a breaching placement now counts toward the conflict total, is highlighted, is reachable
by _Next conflict_, and matches the "Has conflict" filter. It is a correction — the bar was always
breaching the bound and the product was silent about it — but nobody's plan data changes and no date
moves.

**Why a reason and not a second boolean.** The spec's own justification was wrong and was measured
before the field was built: it argued the mandatory pair needed a flag "because remaining float does
not cover them", and remaining float covers all four, because a mandatory pin collapses total float
to zero so any drift takes the remainder negative exactly as a "no later than" ceiling does. What
the number cannot say is which of two things happened — a planner overran their **own slack**, which
is theirs to spend, or they overran a **commitment somebody recorded**. Same sign, different
sentence. A placement past an activity's own float with **no** constraint gets no reason at all;
there is no bound to breach, and flagging it would fire on every deliberate over-placement.

**The conflict key splits with it, so the surface keeps the distinction.** The two sides do not share
a remedy: an early placement is answered by clearing it, which the selection bar already offers, and
a late one routes to the constraint the planner may not know exists — and because clearing stays
available regardless, that route is added rather than substituted. Collapsing them would have carried
the fix as far as the count and discarded it at the thing a planner presses.

The boolean is now a derived column and the database says so: a CHECK refuses any row where the flag
and the reason disagree, which turns an invisible wiring defect — a column dropped from the batched
`UPDATE SET`, which a unit test mocking the raw statement cannot see — into a loud failure on the
first recalculation of a plan that has a conflict.

The migration backfills `EARLIER_THAN_LOGIC` where the flag is already set. That is a transcription
rather than a claim about unknowable history: the boolean has meant that one condition for its whole
life. It is also required — without it the constraint's `VALIDATE` fails on any populated host while
succeeding on the empty database CI provisions, which is the API failing to boot. Proved both ways
against a populated database, with every assertion made to fail first.

The pure forward and backward passes are untouched: early and late dates, float, criticality and the
project finish are byte-identical.
