---
'@repo/api': minor
'@repo/types': minor
---

Activities can now carry a **secondary schedule constraint** (M4-F3, ADR-0035 §10). The primary
constraint drives the forward pass (early dates) as before; the new
`secondaryConstraintType`/`secondaryConstraintDate` pair drives the backward pass (late dates) — the
canonical pairing is a forward primary + a backward secondary (e.g. an SNET that moves the early start
plus an FNLT that tightens the late finish). A secondary of a forward-only kind (SNET/FNET) is a
documented no-op on the backward clamp, and an activity with no secondary is scheduled byte-identically
(the golden suite is unchanged).

The pair is client-settable via the create/update DTOs with the same both-or-neither pairing rule as
the primary (mirrored by a DB CHECK constraint), exposed read-only on the activity response and the
shared `ActivitySummary`, and read on the recalc load. Additive, nullable columns — no data migration.
