---
'@repo/api': minor
---

Progress write boundary hardening (M2, ADR-0035 §6). The progress endpoint now
accepts `remainingDurationDays` (converted to stored minutes; null derives it
from percent complete) and validates actuals against the plan's data date:

- **N07** — an actual start/finish after the data date is rejected
  (`ACTUAL_AFTER_DATA_DATE`).
- **N08** — a complete activity with no actual finish has its finish repaired to
  the data date (logged warning).
- **N18** — remaining > 0 on a complete activity is repaired to 0 (logged warning).

N06 (finish before/without start) is unchanged. Actuals never move.
