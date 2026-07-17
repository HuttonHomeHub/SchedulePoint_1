---
'@repo/web': minor
---

Enable the two remaining dark web surfaces by default. **Float & critical plan settings**
(`VITE_FLOAT_CRITICAL_SETTINGS`, ADR-0035 §17/§18/§20) and **advanced activity types**
(`VITE_ADVANCED_ACTIVITY_TYPES`, ADR-0035 §21/§24 — Level of Effort + WBS summary/parent pickers) now
default **on**, having cleared their component/ux/a11y reviews. The engine, API, and conformance behind
both were already live; this flips the web pickers on so a planner can use them without an env override.
Set either flag to `false` to roll back to the prior surface, byte-for-byte. (The server-side
`PLAN_EDIT_LOCK_ENFORCED` stays the one deliberate ops switch, enabled after the pen bundle is live per
ADR-0028 §9 — unchanged.)
