---
'@repo/api': patch
'@repo/seed-http': patch
'@repo/seed-cli': patch
---

Correctness pass, phase 1 (api/seed): a calendar whose working time the schedule cannot reach
now answers recalculate and the critical-path test with a typed
`422 CALENDAR_WORKING_TIME_UNREACHABLE` instead of an unhandled 500 (#205, the ADR-0071
pattern), and the seeder sends a holiday exception as `isWorking: false` rather than the
`windows: []` the API deliberately refuses — so the catalogue's non-working seasons are seeded
instead of silently dropped.
