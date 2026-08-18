---
'@repo/api': minor
'@repo/web': patch
---

Arm the retention expiry: deleted clients, projects and plans are permanently removed once they pass
the retention period (ADR-0096 D2). Off by default — `RETENTION_HIERARCHY_ENABLED=true` arms it, and
the clock is retroactive, so read the Recently deleted countdown before doing so. Each permanent
deletion writes one `hierarchy.expired` audit event inside the deleting transaction, naming the item
and its blast radius.

Fixes a defect in the arming switch itself: it was declared with `z.coerce.boolean()`, which reads
the string `'false'` as **true**, so the documented way to turn off the product's only aimable hard
delete turned it on. It is now an enum that refuses any value it cannot read as a decision.
