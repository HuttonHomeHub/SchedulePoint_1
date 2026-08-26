---
'@repo/web': patch
---

The activity actions at the foot of the plan workspace no longer run off the right-hand edge. On a
1920 px display **Clear visual placement** was rendered off-screen; at 1646 px **Edit**, **Duplicate**
and **Delete** went with it. The row now wraps to a second line instead of hiding controls.

Measured before and after: the row's content was 1753 px wide at every width, against 1619 px of
space at 1920 and 1345 px at 1646. Focusing a hidden control did not bring it into view — its
position was identical before and after — so it could be reached by keyboard and never seen.
