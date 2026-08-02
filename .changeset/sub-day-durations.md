---
'@repo/types': minor
'@repo/api': minor
'@repo/web': minor
---

Read activity durations in days, hours and minutes (ADR-0070, behind `VITE_SUB_DAY_DURATIONS`)

The engine has scheduled sub-day work for a year and the API has accepted `durationMinutes` since
`api-v0.34.0`, but the activity editor offered a whole-number **days** box — so a four-hour lift or a
90-minute commissioning step could be imported, scheduled and exported, and never typed.

Behind the new flag the duration field reads text with a `d`/`h`/`m` grammar (`2d 4h`, `90m`,
`1.5d`); a bare number still means days, so every value already in use keeps its meaning. The
day↔minute factor comes from the calendar the form currently selects (ADR-0068), and where it is not
known the field stays in whole working days rather than guessing.

Also fixed, unflagged: a canvas move resent the activity's **rounded** duration, silently flattening
a sub-day activity to zero days; it now round-trips the exact stored minutes. `durationMinutes` and
`lagMinutes` join the shared `@repo/types` shapes and the guest share DTOs, so a shared programme no
longer shows a four-hour activity as `0 d` with no way to tell it from a milestone.
