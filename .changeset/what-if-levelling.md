---
'@repo/api': patch
---

The DCMA metric-12 what-if (critical-path test) now levels both its control and perturbed
passes on a plan with `levelResources` set, through the same rule `recalculate` uses
(`docs/TECH_DEBT.md` #248). Previously it measured against the pure-network schedule even on a
levelled plan, which a recalculation no longer persists or displays — so the completion carrier
and its reported movement could be wrong on such a plan. Off `levelResources`, the route is
byte-identical to before.
