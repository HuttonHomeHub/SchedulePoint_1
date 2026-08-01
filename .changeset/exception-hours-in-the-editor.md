---
'@repo/web': minor
---

Give a dated exception its actual hours, and let one be corrected in place (behind
`VITE_CALENDAR_SHIFT_EDITOR`)

A calendar exception could say only that a day works or doesn't. A half-day before a shutdown, or a
turnaround day with a short crew, had to be entered as a whole worked day — the schedule then
planned eight hours of work into four, and the screen showing the exception said "Working day", so
nothing on it was visibly wrong.

The Type control gains a third option, **Working — specific hours**, which opens the same
`WindowListEditor` the weekly pattern uses. A row now shows the hours it works beside its badge, so
a half-day reads as a half-day in the list rather than only inside the form.

Each row also gains **Edit**. Before this, correcting an exception's hours meant removing it and
adding it back: two writes, a new id, and a window in between during which the holiday had become an
ordinary working day — a recalculation landing in that window would have scheduled work on it. The
edit is gated on the exception's own `version`, so two tabs is a conflict rather than a silent
overwrite. The date stays fixed, because moving an exception is remove-then-add and both of those
actions are already there.

A whole worked day still reads back as **Working day**, not as `00:00`–`24:00` in two text fields —
that is the round trip of the shorthand the API writes, and re-authoring a value nobody chose is how
a Save that touched nothing would change something.

Flag off, this surface is exactly what it was, and the existing suite pins it.
