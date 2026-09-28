---
'@repo/interchange': minor
'@repo/web': minor
---

The import report is now read tolerantly: a report carrying a field this release does not know is
accepted with that field dropped, at every level of the report, instead of failing the import review
with "Something went wrong". Known fields are validated exactly as strictly as before. The producer's
own tests use `interchangeReportStrictSchema`, which still refuses an undeclared key (ADR-0162 D9).
