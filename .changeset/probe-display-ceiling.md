---
'@repo/web': patch
---

Canvas benchmark: a display that cannot reach the floor now reports INDETERMINATE instead of FAIL.

The probe measured the display's idle frame interval, stored it on every reading and printed it in
the report — and the judge never read it. So a machine whose display physically cannot produce as
many frames as the floor demands was failed for its refresh rate rather than for the painter's cost.

Observed on a 30 Hz display: an arithmetic ceiling of 30.3 fps judged against the 500-activity floor
of 45 fps, which no painter could ever pass. The verdict now names the ceiling, the floor and the
arithmetic, and says the remedy is a display that can answer the question — not a lower floor and
not a faster painter.

Any throttled display reaches this, not only a phone: Low Power Mode, a laptop on battery, a panel
negotiated at 30 Hz, a remote session, or thermal throttling under a long run.
