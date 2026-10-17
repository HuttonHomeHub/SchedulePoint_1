---
'@repo/seed-cli': patch
---

Seed the `capability-constraints` plan on an explicit Monday–Friday calendar, so its `C_NONWORK` case (an SNET dated on a Saturday) has a weekend to resolve past instead of passing on the 24/7 calendar by default.
