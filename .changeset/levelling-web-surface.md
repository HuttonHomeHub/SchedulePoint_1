---
'@repo/web': minor
---

Resource levelling on the web, behind `VITE_RESOURCE_LEVELLING` (default off, ADR-0041). The plan
scheduling settings gain a **Level resources** toggle (the opt-in switch for the second levelling pass)
and, when it is on, a **Level within float only** toggle (delay only within total float, never extending
the schedule). The resource form gains a **Max units/hour** capacity field (the availability ceiling the
levelling pass respects; blank = uncapped), and the activity form gains a **Levelling priority** field
(lower wins the resource when two activities contend), hidden for types levelling never moves (milestone,
LOE, WBS summary). Once a plan has levelled, the schedule summary shows a **levelled overlay** — the
levelled project finish and the levelled / window-exceeded / over-capacity counts — alongside the
unchanged pure-network critical path and floats. Everything behind it (the plan `levelResources` /
`levelWithinFloatOnly` options, resource `maxUnitsPerHour`, activity `levelingPriority`, the opt-in second
engine pass and its levelled overlay + summary counts) was already live; this only exposes it in the UI.
Set `VITE_RESOURCE_LEVELLING=true` to enable it in an environment.
