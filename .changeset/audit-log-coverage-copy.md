---
'@repo/web': patch
---

Say what the audit log actually records, on both screens.

The organisation log's subtitle promised "permission changes, deletions and sign-ins for this
organisation". A sign-in can never appear there: authentication happens before an organisation is
known, so those rows carry no organisation and the read filters on exactly that column. And its
empty state said "No events recorded yet", which asserts that nothing happened — when what it
actually means is that building a plan is outside what this log records today.

Together those two sentences sent the first person who opened it looking for work that was never
going to be there, and left them with no way to tell a working feature from a broken one. Both
screens now name the boundary: what is recorded, what is not recorded _yet_, and which of the two
screens carries sign-ins.

No behaviour change — copy only. Activity-level edits remain outside the log's M1 scope.
