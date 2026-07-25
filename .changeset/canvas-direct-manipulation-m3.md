---
'@repo/web': minor
---

feat(web): start-edge resize + draggable lag anchors on the TSLD canvas (canvas direct manipulation M3, ADR-0052)

Third slice of the canvas direct-manipulation upgrade, behind `VITE_CANVAS_DIRECT_MANIPULATION`
(default **off**). When on, a Planner (pen held, not under the read-only Late overlay) can now:

- **Resize from the start edge** (mode-aware, ADR-0052 §3): dragging a bar's start moves the start
  and keeps the finish pinned (`duration = finish − newStart + 1`, clamped ≥ 1 day), with a live
  ghost labelled with the tentative start date + duration. EARLY mode commits ONE full-definition
  `PATCH {constraintType: SNET, constraintDate, durationDays}` (the spike-verified combined PATCH,
  mirroring the reposition payload); VISUAL mode commits the minimal
  `PATCH {visualStart, durationDays}` through the existing `setVisualStart` seam. One-step undo on
  the shared `resize:{activityId}` coalescing key (a new `visualResizeCommand` restores the prior
  placement AND duration in VISUAL mode).
- **Drag a link's lag anchor** along the time axis: each drawn (offset) lag anchor gains a grab
  zone; the tentative lag runs through the exact **inverse** of the M1 anchor mapping
  (`lagFromAnchorDay`, one shared pure fn with round-trip property tests), snapped to whole days on
  the relationship's **lag calendar** (negative = lead), with a live `SS + 3d` readout chip. The
  drop issues `PATCH /dependencies/:id` echoing the unchanged type + lag calendar at the live
  version, under the existing 409 conflict / 423 pen contracts, then notifies the coalesced
  auto-recalc. One-step undo via the coalescable `lagDragCommand` (key `lag:{dependencyId}`).
- **Keyboard lag nudge** (WCAG 2.1.1): the canvas has no per-dependency keyboard surface, so
  `Shift+←/→` lands on the Logic panel's dependency rows (with a focused row's Edit/Remove button)
  — coalesced like the sibling nudges and announced via the polite live region, with an in-panel
  hint advertising the chord.

Frontend-only — no API/schema/engine change (the recalc parity gate is untouched; the one web-API
seam change is `useSetActivityVisualStart` optionally carrying `durationDays`). Flag-off the
zones, gestures, keymaps and paint are byte-for-byte today's (parity tests).
