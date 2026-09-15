---
'@repo/api': minor
'@repo/web': minor
'@repo/types': minor
---

The organisation landing now says **where each recently-changed programme stands** — its finish, how
far that has moved against the active baseline, and anything the last recalculation flagged.

Movement is a **three-valued union, never a nullable number**. `MOVED` carries signed working days
(positive is later), `UNCHANGED` names the baseline it matched, and `NOT_ASSESSABLE` carries one of
five reasons — no activities, not yet calculated, no baseline, a baseline with no finish, or a plan
calendar with no working time. A `?? 0` would have told a reader their unbaselined programme is
exactly on the plan they never captured, so the union has no numeric fallback and the compiler
refuses that shape. Each reason has a different remedy, and each is rendered as a **sentence** rather
than a dash: a row of em dashes reads as breakage, not as absence.

The measurement frame is the revision comparison's, not a second one — working time on the plan's own
calendar, divided by the baseline's frozen hours-per-day factor. Two numbers on one product derived
on different calendars is a worse defect than any residual in either. A calendar that cannot be built
or walked makes **that plan's** movement unassessable rather than failing the whole landing, because
one bad calendar among eight must not answer the first screen after sign-in with an error for
everybody in the organisation.

**The CPM engine is not invoked.** Every figure is a column the last recalculation already persisted,
so `computeSchedule` is neither called nor imported by the read or by the pure derivation beside it —
pinned structurally — and the recalculation parity gate is untouched by construction. The section is
**omitted rather than emptied** for a caller who may not read schedules, and the gate runs before the
read is issued rather than after it returns.

Measured before it shipped: at 3,000 plans and 120,000 activities the endpoint's p95 is 59.3 ms
against a 200 ms bar, and the standing query's estimated cost is flat across every shape — 1,388 at
the largest — which is the signature of a read driving off its plan-id filter rather than scanning the
organisation.
