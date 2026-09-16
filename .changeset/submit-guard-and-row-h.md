---
'@repo/web': patch
---

Ten dialogs no longer drop your place when you save. A submit button that blocks itself with the
native `disabled` attribute leaves the tab order the instant the request starts and rejoins it when
the request settles, so anyone working from the keyboard is thrown to the top of the page twice per
save. Those ten now shade and announce without leaving the tab order, and a gate keeps it that way.

Row menus on the clients, projects and plans tables now say which list they belong to, because the
Project Explorer beside them names its own menus the same way and the two were indistinguishable to
anyone hearing them rather than seeing where they sit.
