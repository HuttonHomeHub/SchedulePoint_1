---
'@repo/api': minor
---

List endpoints no longer advertise a sort-direction param they ignore.

`PaginationQueryDto` carried an `order` field, so every cursor-paginated list documented
`?order=asc|desc` in its OpenAPI — while exactly one of them (a plan's baselines) actually read it.
Everywhere else the value was accepted and discarded: a client sending `order=desc` got a `200` and
the wrong page, with nothing in the response to suggest otherwise. A documented no-op is worse than
an absent feature, because it looks like a contract.

`order` now lives only on `ListBaselinesQueryDto`, the one list that honours it. Every other list
keeps its fixed direction — which was always a product decision (a member roster reads oldest-first,
a note thread newest-first) — and simply stops claiming otherwise.

**Behaviour change:** because the API rejects unknown query params, sending `order` to a list that
does not declare it is now a `422` rather than being silently ignored. No SchedulePoint client sends
it. A list can opt back in by declaring `order` in its own query DTO and threading it into its
`orderBy`; a `(created_at, id)` keyset reverses correctly provided both terms flip together.
