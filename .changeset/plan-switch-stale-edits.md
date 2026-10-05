---
'@repo/web': patch
---

Opening another plan no longer makes the status bar say "N edits not calculated" on a plan nobody has edited. Switching plans from the Project Explorer used to carry the previous plan's state across, so the new plan's activities were counted as edits (and, while holding the pen, recalculated for no reason).
