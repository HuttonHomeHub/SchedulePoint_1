---
'@repo/api': patch
---

Recalculating a plan with levelling on is faster, most of all when one resource carries most of the plan:
the worst case at 2,000 activities (one resource on every activity, capacity 8) drops from about 0.87 s to
0.18 s, and an ordinary levelled plan recalculates about 2.5 times faster. Every date is unchanged.
