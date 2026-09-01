---
'@repo/web': minor
---

An **Edit link** save is now undoable. Changing a link's type, lag or lag calendar from the dialog
records an undo step like every other way a link changes, so `Shift+←/→` on a link and typing into
the same link's lag field no longer behave differently from one panel, one row apart.

The inverse restores the lag in **minutes**, so a sub-day lag — a two-hour cure, a 90-minute lift —
comes back exactly rather than as the rounded whole day the list view shows.
