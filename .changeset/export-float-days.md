---
'@repo/api': minor
---

The organisation export is now format 2.0. Its float columns were labelled as minutes (`totalFloatMinutes`, `freeFloatMinutes`, `remainingFloatMinutes`, and the baseline's `totalFloatMinutes`) but hold working days on the activity's calendar, so they are renamed `totalFloatDays`, `freeFloatDays` and `remainingFloatDays` and documented as working days. The values are unchanged; renaming a column is a major format change. The format also carries 1.1's `derivedDurationMinutes` on activities.
