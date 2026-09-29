---
'@repo/web': patch
---

The activities panel no longer re-renders its whole table when you select something on the
canvas, and ticking a row's checkbox or opening its actions menu now re-renders only that row
instead of every row, which is what made those clicks slow on plans with thousands of activities.
