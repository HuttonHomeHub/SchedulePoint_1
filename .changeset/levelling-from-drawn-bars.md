---
'@repo/api': minor
---

Resource levelling now works from where each bar is drawn; plans with hand-placed bars level
differently. A clash you have separated by hand is no longer reported, one you have made by hand is,
and the levelled start, finish and delay are measured from the drawn bar. Levelling order now
breaks ties on the float a placement has left. The critical-path health test still judges the logic
network. Plans with no placed bars level exactly as before.
