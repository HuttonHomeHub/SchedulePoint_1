---
'@repo/web': minor
---

Enable progress ingestion by default (`VITE_PROGRESS_INGESTION`, ADR-0035 M2).
The progress editor's remaining-duration + suspend/resume inputs and the
plan-level recalc-mode picker now ship on; set `VITE_PROGRESS_INGESTION=false` to
roll back to the percent-plus-actual-dates editor. No API or engine change — those
were already live regardless of the flag.
