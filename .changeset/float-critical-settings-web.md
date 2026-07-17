---
'@repo/web': minor
---

Plan float & critical scheduling settings (M6-F7), behind `VITE_FLOAT_CRITICAL_SETTINGS` (default off).
A new `PlanScheduleSettings` block on the plan detail screen adds three controls — **Critical-path
definition** (Total float / Longest path), **Total-float measure** (Finish / Start / Smallest), and a
**Make open ends critical** toggle — mirroring the existing recalc-mode / expected-finish pickers
(optimistic select, live-region announce, read-only summary for non-editors). Each persists as a
targeted plan PATCH; a later Recalculate applies it to the computed critical path. The engine/API
behind these options is already live (M6-F2/F3/F4); this exposes them in the UI.
