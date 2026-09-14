---
'@repo/web': patch
---

The minimap stops painting out milestones that sit on the data date. The data-date vertical was
the last thing drawn, 1px wide and full height, so any zero-duration activity standing on it
disappeared — 42 start milestones and 34 finish milestones on the measured plan. It now draws
above the month/year tiers and beneath the bars: still ahead of texture, no longer ahead of the
plan's own work.
