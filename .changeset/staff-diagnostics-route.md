---
'@repo/api': minor
---

Add `GET /api/v1/staff/diagnostics` — counts, and nothing else (ADR-0140).

The question that decides whether a defect is worth chasing — how many activities, across how many
plans — has never been answerable without `docker compose exec db psql`, which is wider, unaudited,
unrated and unreachable by the person who needs the number. The route returns integers: how many
rows each named question was asked of, how many answer it, and how many plans and organisations
those rows fall in. No plan, client, project or activity is ever named, at any size.

It narrows ADR-0086 D6 rather than claiming to sit outside it — the SQL reads `activities`, `plans`,
`calendars`, `resource_assignments` and `resources` — and says so. ADR-0086 D1 is untouched: no
`Principal` is minted, no member service is called, and the three structural assertions that hold
that property pass unedited.

Two diagnostics ship: the driving-resource day-factor divergence `docs/TECH_DEBT.md` #86's M0-T3
asks for, and the inherited-plan-calendar half ADR-0139 fixed. Both are retrospective — they size
whose stored numbers changed meaning, not a live defect.

The route accepts no parameter of any kind. That is the decision rather than a small API: a
parameterless aggregate cannot be used to ask about anybody in particular, and a filter would make
it a differencing oracle. A structural gate refuses an input decorator on the handler.
