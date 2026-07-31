---
'@repo/interchange': minor
'@repo/api': minor
---

Import: ask about a resource-name collision instead of blocking on it

Importing a file that names a resource the organisation already has — under that name but not
under a code that identifies it as the same row — used to fail with a bare
`409 A resource with these details already exists.`, with no way forward short of renaming or
deleting the library row by hand.

The dry-run now reports each collision (`report.resourceCollisions`), naming the incoming
resource and the library row it clashes with, and the commit takes an answer per resource in a
new `resourceResolutions` field: `REUSE_EXISTING` binds the imported assignments to the row
already there, `CREATE_COPY` creates a separate resource under a disambiguated name so the
file's own rate and calendar survive. Both answers are recorded as `repair` findings on the
post-commit report — "reuse" silently drops the file's rate and calendar for that resource, and
that is worth saying out loud.

A collision left unanswered fails the commit with a named list
(`422 UNRESOLVED_RESOURCE_COLLISIONS`) rather than being guessed: a resource library is
org-global, and levelling, over-allocation and Earned Value all read from one pool, so reusing
the wrong row and duplicating one crew are both wrong in ways a report line cannot undo. A code
match is still an identity match and asks nothing.
