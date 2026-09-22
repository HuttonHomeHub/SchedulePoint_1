---
'@repo/web': minor
---

The diagram's logic lines cross each other less, and `Arrange` says when it is worth pressing.

The router now chooses each corridor for what it **crosses** rather than only for what it hits —
measured at 20.8 % fewer crossings per link on a real imported programme, at no vertical cost. The
canvas also offers `Arrange` where one press would tidy the rows, stating what it would do in both
directions, because a press can legitimately make a diagram taller when the current layout overlaps.

Two remedies were measured and **not** shipped: a taller row gap cannot separate two runs through
one gutter (the geometry puts them at the same y whatever the pitch), and all three logic-aware
row-assignment rules measured worse than the packer that ships.
