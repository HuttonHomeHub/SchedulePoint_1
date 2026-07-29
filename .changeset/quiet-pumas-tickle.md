---
'@repo/web': minor
---

Add a dependency inline in the Logic panel, instead of opening a second dialog

The **Add predecessor** / **Add successor** buttons are replaced by one **Add a link** section
below the two tables, carrying the direction as a field alongside the activity, type, lag calendar
and lag. Adding a link is the Logic panel's main action and it opened a modal on top of a modal to
do it; the new row appearing in the table above is also better feedback than a dialog closing over
one. The refusals a planner can meet — a cycle, a duplicate — still come back from the server and
show inline, and the "this plan has no other activities yet" way-out is unchanged.

A Save that cannot be used is now shaded with the reason it cannot, linked to the button for screen
readers, rather than simply disabled.
