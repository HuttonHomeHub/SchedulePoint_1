---
'@repo/api': minor
---

Restoring a plan or activity is now refused with 409 `CALENDAR_WRONG_SCOPE` when the calendar it uses
has been narrowed to a different project while it sat in the bin. `details` names the calendar and
the project it now belongs to.
