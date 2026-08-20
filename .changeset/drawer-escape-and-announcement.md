---
'@repo/web': patch
---

Fix two things in the plan workspace's context drawer.

Pressing Escape to dismiss a confirmation inside the activity editor — "Discard unsaved changes?",
or "Delete note" on the Notes tab — also closed the editor underneath it. A native confirmation is
painted above everything else but still sits inside the panel, so the drawer was treating a keypress
meant for the confirmation as one meant for it.

And opening the editor said nothing to a screen reader. Pressing **Edit**, **Report progress** or
**Steps** used to open a dialog, which a screen reader announces by itself; in the drawer it swapped
the panel silently. It now announces what opened — and deliberately stays quiet when you simply
select a different activity with the drawer already open, which is a change of subject rather than
something opening. Closing the editor is announced too, which it was not.
