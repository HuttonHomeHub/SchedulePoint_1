---
'@repo/api': patch
---

A start milestone or zero-duration task that follows a cross-plan link now starts at the instant the link gives it, as it does in one plan, instead of being moved to its own calendar's next working minute. A start milestone on a weekend calendar after weekend work in another plan no longer pushes the weekday work after it a week late. Plans with such a link are recalculated on their next recalculation.
