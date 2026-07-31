---
'@repo/interchange': minor
'@repo/api': minor
'@repo/web': minor
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

The import dialog gains a third step listing each clash with the library row it clashes with,
and a choice per resource. Confirm stays shaded with the reason attached to it (`aria-disabled`,
not the native attribute — a natively-disabled button leaves the tab order and takes the reason
with it) until every one is answered. Answers are discarded whenever the report is re-fetched:
an answer belongs to the report that raised it.

`SegmentedControl` now accepts `value={null}` for a question with no answer yet, and gives the
first option the group's tab stop — otherwise every option is `tabIndex={-1}` and an unanswered
group is unreachable by keyboard (WCAG 2.1.1).
