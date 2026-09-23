---
'@repo/api': minor
---

A finish milestone is now dated by the day it closes (ADR-0155). After a task ending Friday it reads
Friday, not the following Monday, which is how P6 and NetPoint print it. Every date given for a
finish milestone (its placement, constraints and external dates) means the end of that day, so
placing one on its predecessor's last day is no longer a conflict, and "finish no later than" on
that day gives zero float. A migration moves each stored finish-milestone placement one day earlier,
which keeps its instant unchanged, and records each row for the documented reverse. On first start
the API recalculates, once, every plan last computed under the old rule.
