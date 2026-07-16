---
'@repo/web': minor
'@repo/api': minor
'@repo/types': minor
---

Progress ingestion web controls (M2, ADR-0035), behind `VITE_PROGRESS_INGESTION`
(off by default). When enabled:

- The progress editor gains a **remaining duration** input (blank derives it from
  percent complete) plus **suspend / resume** dates for a paused activity — with
  client-side validation mirroring the API (resume ≥ suspend).
- Plan settings gain a **recalc mode** picker — Retained Logic / Progress Override
  / Actual Dates — persisted with a targeted PATCH and applied on the next
  recalculation.

The activity read model now exposes `remainingDurationDays`, `suspendDate`, and
`resumeDate` (`@repo/types` + the activity response DTO), so the editor seeds and
round-trips a stored value even with the inputs hidden. The engine, the settable
API fields, and the plan recalc-mode column were already live; this slice only
adds the flag-gated authoring UI.
