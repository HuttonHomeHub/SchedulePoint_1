---
'@repo/interchange': minor
'@repo/api': minor
'@repo/web': minor
---

Close the shift editor's seven deferred findings (TECH_DEBT #82).

An import's calendar windows are now sorted, de-duplicated of empty spans and merged where they
overlap — each one a reported repair rather than an opaque 500 from a recalculation days later —
and a standard working day below the domain's floor is raised instead of rounding to zero stored
minutes. The calendar library table stops showing a two-shift calendar and a plain Mon–Fri one as
the same row. Window problems clear as you correct them once they are on screen, an overlapping
pair flags both of its rows, and adding or removing a dated exception on an organisation calendar
takes the same `calendar:manage_org` capability that editing one already did.
