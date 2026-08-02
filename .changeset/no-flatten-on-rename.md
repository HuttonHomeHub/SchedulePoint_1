---
'@repo/web': patch
---

Stop losing a calendar's working hours when someone renames it

A calendar that works specific hours — a split shift, a part day — lost them the moment anyone
opened it in the calendar form and saved, even a rename. The form seeded `workingWeekdays` from the
calendar it loaded and always submitted it, and the API replaces every stored shift row whenever
that field is present. Silent: no error, and the response looked right, because the weekday mask
really is Mon–Fri either way. Only the request body showed it.

The form now sends `workingWeekdays` **only when the planner actually changed the week**. Renaming a
calendar means renaming a calendar. The regression test asserts the request body of a rename-only
save and was verified to fail against the old code first — the assertion it replaces had pinned the
defect, asserting the mask was present.

Where the mask genuinely cannot describe the calendar, the form now says so instead of implying the
seven checkboxes are the whole truth: "This calendar works specific hours … the days below show
which days work, not their hours." Editing them still replaces those hours with whole days, which is
honest — it is the only week control that exists until the shift editor ships — but it is no longer
a surprise.

Exposure was narrow: only a calendar authored through the API directly could carry such hours, since
the importer does not create one. It widens the moment the editor lands, which is why this goes
first and unflagged.
