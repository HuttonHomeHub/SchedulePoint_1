---
'@repo/api': minor
'@repo/types': minor
---

Activities can now be flagged **Schedule As-Late-As-Possible** (M4-F4, ADR-0035 §11). The new
`scheduleAsLateAsPossible` boolean is a **display-only** placement preference: a flagged activity is
rendered at its late-based position (its already-computed late dates), while the pure
`early*`/`late*`/`totalFloat` schedule stays a pure function of the network — it is never a date
constraint. The zero-**free**-float refinement (place only as late as successors allow) lands in M6;
until then the late-based position is the render target.

The flag is client-settable via the create/update DTOs, exposed read-only on the activity response and
the shared `ActivitySummary`, threaded into the engine seam, and read on the recalc load. Additive,
defaulted column — no data migration; the golden suite is unchanged (a new A9400-style golden pins the
non-interference contract). The on-canvas editor for the flag is a later slice.
