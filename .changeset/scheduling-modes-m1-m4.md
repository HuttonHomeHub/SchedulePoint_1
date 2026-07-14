---
'@repo/api': minor
'@repo/web': minor
'@repo/types': minor
---

feat: scheduling modes — mandatory project start + Visual planning (ADR-0033)

Delivers ADR-0033's scheduling model. The **mandatory project start (M1)** is a live product
change; the **Visual-planning surface (M2–M4)** ships behind the default-off `VITE_SCHEDULING_MODES`
flag until enablement.

**M1 — Mandatory project start (live):**

- A plan can no longer exist without a start date. A backfill+NOT-NULL migration sets
  `plans.planned_start` for existing plans (CQ-6 chain: earliest active constraint date → actual
  start → creation day) and makes the column NOT NULL. `CreatePlanDto.plannedStart` is required (422
  without); `UpdatePlanDto` rejects an explicit `null` (the data date can be moved, never cleared).
  The web plan form requires it, and the ADR-0032 "first draw anchors to today" hack is gone.

**M2–M4 — Visual planning (behind `VITE_SCHEDULING_MODES`):**

- A plan-level `schedulingMode` (**Early** = computed-earliest CPM, **Visual** = hand-placed) with a
  toolbar mode selector, and a Planner-owned `Activity.visualStart` placement input fed through the
  engine's second, forward-only effective-Visual pass (placements pin the bar and push unplaced
  successors; the pure-network pass still owns early/late/float).
- A Visual-mode canvas drag hand-places `visualStart` (no implicit SNET constraint); Early mode keeps
  the SNET path. Engine-owned conflict flags surface as an on-canvas warning triangle (shape, not
  colour-only) with a spoken read-out — placements are flagged, never auto-moved.
- Navigation/data split: a "Go to date" view jump distinct from the persisted "Project start" anchor.
- A read-only **Late-start overlay** renders bars from the late dates for float analysis (editing
  suppressed while on).

Flag-off, the TSLD renders exactly as before.
