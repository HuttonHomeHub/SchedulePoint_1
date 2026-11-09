---
'@repo/api': minor
'@repo/web': minor
---

SchedulePoint 1.1.0 — the first public release. **Needs a fresh, empty database**: this version refuses to start on
a database made by 1.0 or earlier and leaves it untouched. Follow `docs/guides/start-fresh-on-1-1.md`.

What changed (ADR-0215): the database history is one clean starting point; code that only existed for data saved by
older versions is gone, along with the published fields, values and export columns that could no longer occur (the
placement-migration report route, five organisation-export columns and three record files — the export format is
now 3.0), recorded as a one-time exception to ADR-0190 because nothing outside SchedulePoint uses them; and every web
feature switch is retired (each was already on in every published image). Going back to 1.0 means restoring the old
database volume or the backup taken first — pinning the image tag alone does not cross this release.
