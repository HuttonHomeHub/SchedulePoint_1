---
'@repo/api': minor
'@repo/types': minor
---

External / inter-project dates now persist and flow into the CPM recalc (ADR-0043 / ADR-0035 §30, M1).
An activity carries two optional calendar-day fields `externalEarlyStart` (an SNET-shaped forward lower
bound, floored at the data date) and `externalLateFinish` (an FNLT-shaped backward upper bound) — imported
commitments gating it from another project; either, both, or neither may be set. They are **soft** bounds,
never mandatory pins: the engine clamps early start UP to / late finish DOWN to them on the existing
forward/backward passes and flags the activity external-driven, never setting `constraintViolated`. A new
plan scheduling option `ignoreExternalRelationships` (default `false`, byte-parity) drops every external
bound so a plan can be viewed on its own logic vs. gated by its neighbours. Boundary reject: an external
late finish before the external early start when both are set returns **422** `EXTERNAL_FINISH_BEFORE_START`
(N26), with a nullable-safe DB CHECK backstop. The recalc + `GET …/schedule/summary` roll-up expose an
`externalDrivenCount` (engine-derived on a recalculation). Additive DTO/response fields on the activity and
plan resources; new shared type fields on `ActivitySummary`, `PlanSummary`, and `PlanScheduleSummary`. The
no-external / option-off path is byte-identical.
