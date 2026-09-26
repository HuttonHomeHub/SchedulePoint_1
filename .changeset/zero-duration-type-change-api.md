---
'@repo/api': minor
---

Changing a zero-duration activity's type into or out of a finish milestone no longer moves it. A
finish milestone reads a date as the end of that day and every other type as the start, so the same
stored date used to mean a later point after the change: a zero-duration task pinned to a Monday
became a milestone at the end of that Monday, and its successors moved a working day later. The API
now moves each stored placement, constraint and external date that the request did not send by one
calendar day, so the activity keeps its point in the schedule and its successors and float are
unchanged. A date sent in the same request is read the new type's way and is not moved, and the
external-date ordering check now runs on the dates that will actually be saved.
