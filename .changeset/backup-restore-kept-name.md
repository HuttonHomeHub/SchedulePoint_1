---
'@repo/api': patch
---

A second `backup restore` within the same minute no longer fails. The database kept aside from before a restore is named by the minute, and two restores in one minute both tried to use the same name, so the second one stopped at the swap (nothing was lost; it simply refused). The kept name now moves on a minute when the first is already taken.
