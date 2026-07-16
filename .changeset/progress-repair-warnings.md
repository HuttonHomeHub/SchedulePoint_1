---
'@repo/api': minor
'@repo/web': minor
'@repo/types': minor
---

Surface progress-repair warnings and clarify the progress editor (M2 follow-up,
ADR-0035 §6).

- The progress endpoint (`PATCH …/activities/:id/progress`) now returns
  `meta.warnings` (a `ProgressWarning[]`) when it repairs a complete activity —
  `COMPLETE_WITHOUT_FINISH` (finish set to the data date) or
  `REMAINING_ON_COMPLETE` (remaining forced to zero). The write still succeeds and
  `data` reflects the corrected value; an ordinary report omits `meta`. Adds a
  reusable single-resource `ResourceEnvelope` for `{ data, meta }` responses.
- The web progress editor announces those repairs on save, and a note makes clear
  the remaining/suspend/resume fields reschedule the remaining work rather than
  change the derived status.
