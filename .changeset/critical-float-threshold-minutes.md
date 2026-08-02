---
'@repo/api': minor
'@repo/types': minor
'@repo/seed': minor
'@repo/seed-http': minor
---

The critical float threshold is stored in working minutes, not days

`criticalFloatThreshold` was documented and validated as whole working **days**, and the service
converted it for the engine at a flat `× 1440`. The engine then compared that against a total float
measured in working minutes on the **activity's own** calendar. On a 24-hour calendar those agree;
on an eight-hour one a planner asking for a 1-day threshold got three working days of float treated
as critical. ADR-0068's defect one field along (surface audit F8).

The field becomes `criticalFloatThresholdMinutes` — working minutes, stored as compared, no lossy
conversion in between. A plan-level _day_ threshold is unfixable by choosing a better factor: a
mixed-calendar plan compares one threshold against floats measured on several different day lengths,
so there is no correct scalar. Minutes is the only representation that is unambiguous for every
activity.

**Breaking:** the field is renamed on the update DTO, the plan response and `PlanSummary`. Pre-1.0,
so a minor bump. `forbidNonWhitelisted` is on, so a client still sending `criticalFloatThreshold`
gets a 422 naming the property rather than a quietly wrong schedule — which is the point of renaming
rather than redefining in place.

Existing data is backfilled at `× 1440`, the same factor the service applied on every recalculation
since the column shipped, so the engine receives an identical number and no plan's persisted
criticality changes. The backfill multiplies in `bigint` and clamps at the ten-year ceiling, because
the DTO carried no upper bound and an overflow would abort the migration — which on a self-migrating
image means the API does not boot.

It also fixes a latent disagreement in the ADR-0066 pairwise harness, which fed the seed spec's day
number straight into the engine's minutes option with no conversion while the service multiplied.
The differential has been comparing two different thresholds, and stayed green only because the
default is 0.
