---
'@repo/api': minor
'@repo/web': minor
---

Filter the audit log by category, outcome and date range (ADR-0073).

Both audit reads accept `action`, `outcome`, `from` and `to`. An unknown value is a 422 naming it
rather than an empty page — an audit log answering "no events" to a misspelled filter reads as
evidence that nothing happened. The organisation route additionally refuses `auth.*` actions, whose
rows carry no organisation and could only ever return nothing there.

The web bar puts the chosen filter in the URL, so a narrowed view survives a reload and can be
pasted to a colleague. The API takes actions, never categories: categories are a reading aid the
client expands before it builds the request, so renaming one for legibility is not a breaking API
change. `VITE_AUDIT_FILTERS` is on by default; setting it to `false` restores the prior screens
byte-for-byte.
