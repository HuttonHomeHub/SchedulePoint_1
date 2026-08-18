---
'@repo/web': minor
---

Recently deleted: fix the delete confirmation, the recycle bin's staleness, and a focus drop.

- A delete confirmation no longer claims work is recoverable "for a limited time". Retention ships
  **off**, so on every host that has not armed it there is no limit — the claim was asserted at the
  one moment a planner decides whether deleting is safe. The sentence is one shared function now,
  and the deadline is stated on Recently deleted, where it can be stated honestly with the server's
  own period.
- Deleting a client, project or plan now refreshes Recently deleted. It did not: once a session had
  opened that screen, every later delete left it serving a cached list, so it said "Nothing has been
  deleted" underneath a toast saying a client had just been.
- Cancelling or closing the "Restore … first" confirmation, or having that restore fail, no longer
  drops keyboard focus to the page body (WCAG 2.4.3).
- The disclosure that lists what a deletion took now names its subject, so it is not heard without
  an antecedent and is not a substring of the Restore button beside it.
- A new plan's start date is labelled `Planned start` rather than `Planned start (optional)`. It is
  required, and leaving it blank was refused by a message calling it "a project start date" — three
  names for one control on one screen.
