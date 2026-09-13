---
'@repo/web': minor
---

The duration and lag fields ask which calendar they are measured in.

The client resolved one day length per activity and used it for everything, which is right until an
activity's work happens somewhere its own figures do not. A resource-dependent activity driven by a
resource on a different calendar now reads and writes its duration, remaining duration and
relationship lag on the calendar it schedules on, matching the API.

**What a planner sees.** The Duration column and the activity editor report a driven activity's
duration in the day length of its driving resource — so a five-day crane lift on a round-the-clock
crane reads as the two days the programme actually reserves. Typing a duration into the editor now
stores that many days of the resource's time rather than of the activity's own calendar, which is
what the field has always appeared to promise.

The assignment join lag deliberately keeps the activity's own calendar; it is measured on the
activity rather than on the work, and that distinction is now named at every call site rather than
implied by which helper was reached for first.
