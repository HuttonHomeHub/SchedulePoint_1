---
'@repo/api': minor
---

A share link now also returns whether each activity is near-critical (`isNearCritical`) and whether each dependency drives its successor (`isDriving`), the same values a member reads (ADR-0198). Every live share link gains both fields on release. Resource-assignment driving flags stay excluded.
