---
'@repo/api': major
'@repo/web': major
---

SchedulePoint 1.0. From this release, the web API under `/api/v1`, the file formats SchedulePoint writes and reads
(including the organisation export and the SchedulePoint layout field inside exported schedules), and the operator
settings in `.env.example` and the Docker Compose files are a promise: a change that breaks any of them moves the
first version number (ADR-0190, `docs/RELEASE_1_0.md`). This release changes no behaviour; it is the version number
and the promise. What 1.0 knowingly ships without is listed under "Known limits at 1.0" in `docs/RELEASE_1_0.md`.
