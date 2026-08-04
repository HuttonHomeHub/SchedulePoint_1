---
'@repo/api': minor
---

Let the audit reads be narrowed by action, outcome and date range.

Both endpoints took `PaginationQueryDto` and nothing else, so seven distinct kinds of event arrived
in one undifferentiated reverse-chronological stream. They now accept optional `action` (repeatable),
`outcome` (repeatable), `from` and `to`. Omitting all four returns exactly the page it returned
before.

An unmatchable value is a **422 naming it**, never a 200 with an empty page — an audit log answering
"no events" to a misspelled filter reads as evidence that nothing happened. That now includes an
`auth.*` action on the organisation route: those rows carry no organisation and could only ever
return nothing there. Read your own sign-in history on `/me/audit-events`.

No index ships with this, on a measurement rather than an assumption (ADR-0073). At 1M rows every
ordinary filtered read is 0.1–3 ms unindexed; the one expensive shape is a combination that matches
nothing, which must walk the whole organisation partition to prove the absence (681–954 ms). That is
three orders of magnitude above where today's vocabulary puts a busy tenant, and it is exactly what
the coverage milestone changes — so the composite index is decided there, per slice, on a fresh
`EXPLAIN`.
