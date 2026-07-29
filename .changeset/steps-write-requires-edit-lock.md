---
'@repo/api': minor
---

The weighted-steps replace now requires the plan edit-lock

`PUT …/activities/:activityId/steps` asserts `assertHoldsPen` like every other
activity write (ADR-0028, ADR-0060 §5). A steps replace bumps the parent
activity's `version` and moves the physical %-complete rollup, so it is a
structural write; until now the client required the pen and the server did not.
The route declares its `423` in OpenAPI. The `GET` is unchanged and stays
member-level.

Two qualifications on the impact. `PLAN_EDIT_LOCK_ENFORCED` defaults to `false`
and `assertHoldsPen` no-ops while it is off, so a default deployment sees no
change today — it bites where enforcement is already on, and at the moment an
operator enables it. And no user loses a visible affordance: every web path to
this write already required the pen, so the change closes a gap between the
client and the server rather than removing a capability.
