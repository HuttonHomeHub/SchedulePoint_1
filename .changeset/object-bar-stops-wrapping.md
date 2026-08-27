---
'@repo/web': patch
---

Selecting an activity no longer shrinks the diagram. The row of object actions at the foot of the
plan workspace needed more width than it had and wrapped onto a second line, taking 36 px of canvas
on a 1646 px screen and 76 px at 1440 — every time you clicked a bar.

Two changes, both measured rather than estimated. **Clear visual start** is now hidden outside
Visual mode instead of sitting there permanently greyed out: on a plan scheduled Early there is no
hand-placed start to clear, so there was nothing for the refusal to say. And **Zoom to selection**
becomes icon-only, keeping its name for screen readers and its tooltip for everyone else.

Neither alone was enough — the measurement showed the row still wrapping with either change on its
own — and moving the two viewport commands onto the command deck, which was the first plan, turned
out to cost 58 px there to save 36 here.
