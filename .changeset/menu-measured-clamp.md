---
'@repo/web': patch
---

Row menus no longer run off the bottom of the window. A menu was positioned as though it were always
200 px tall, so a taller one opened low on screen put its last item — **Delete**, on every row —
below the fold, where it could be reached by keyboard and not by clicking.

The menu is now measured before it is placed, so it stays on screen whatever it contains.
