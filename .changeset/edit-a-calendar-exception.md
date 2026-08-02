---
'@repo/api': minor
---

Edit a calendar exception instead of deleting and recreating it

An exception could be created and deleted, never edited. Correcting a day's hours meant
delete-then-recreate: two writes, a new id, and a window in which a holiday had become an ordinary
working day — one a recalculation landing between them would have scheduled work on.
`CalendarException.version` existed in the schema, was returned on every read, and was never used for
a write.

`PATCH …/calendars/:calendarId/exceptions/:exceptionId` replaces the day's windows as a set, or edits
only the label when neither `windows` nor `isWorking` is sent. It refuses the same contradictions the
create refuses — both spellings at once, an empty array, unsorted or overlapping windows — through the
same shared validator, so an edit can never reach a state a create could not.

Two versions are in play and both matter. The write is gated on the **exception's** version: a stale
one is a 409, because someone else changed those hours since they were read. It then bumps the
**calendar's**, exactly as create and delete already do, so a client holding a stale calendar is told
as well.

The date is deliberately not editable — moving an exception is deleting one and adding another, which
the two surrounding endpoints already do visibly.

Anti-IDOR by shape rather than by check: the exception is reached only through a lookup that requires
its calendar id too, and that calendar has already been resolved inside the caller's organisation. An
exception belonging to a different calendar is a 404 even when the caller may write to both, and the
e2e suite asserts exactly that case.
