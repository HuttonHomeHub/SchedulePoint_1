---
'@repo/web': patch
---

Co-locate the activity progress model on one tab (behind VITE_ACTIVITY_EDITOR_TABS, default off)

Reported progress, the value measure and the manual physical % now sit on
one Progress tab, each panel headed by what it does to the schedule
("Moves the activity's dates" vs "Earns value in Earned Value. Changes no
dates"). The manual physical field is disabled with its reason when
weighted steps override it, instead of staying editable and silently
ignored. Three panels keep three Saves, because progress is not pen-gated
and the measure is.
