---
'@repo/web': minor
'@repo/types': minor
---

Narrow the audit log by category, outcome and date — behind `VITE_AUDIT_FILTERS` (default off).

Seven distinct kinds of event arrived in one undifferentiated reverse-chronological stream. Both
audit screens now carry a filter bar: category chips, an outcome choice and a date range, with the
result in the URL so a narrowed view survives a reload and can be pasted to a colleague.

Categories are questions a reader arrives with — Access, Deletions, Sign-ins — not the twenty
machine names underneath. They never travel on the wire: the client expands the chosen ones into
actions before building the request, so the API keeps one vocabulary and a category renamed for
legibility is a copy change rather than a breaking API change.

Which chips appear is derived from the vocabulary rather than listed. The organisation screen cannot
offer Sign-ins (those rows carry no organisation, so the choice could only ever return nothing), and
a category holding no actions yet stays off screen until its first action lands. A chip that can only
answer "no events" is the defect this filter exists to remove.

A narrowed view that finds nothing now says so, in different words from a log with nothing in it.

Flag-off is byte-for-byte the current screens — no bar, and no filter parameter even with a filter
sitting in the URL from a flag-on build.
