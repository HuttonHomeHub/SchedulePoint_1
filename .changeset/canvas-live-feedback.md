---
'@repo/web': minor
---

feat(web): the canvas tells you when and how much room — live date readout, bar dates, GPM float & drift (ADR-0054)

A time-scaled logic diagram exists to answer two questions graphically: **when** does this happen,
and **how much room** does it have. The canvas now answers both without leaving the diagram.

- **Manipulation reads as the bar itself moving.** While you drag or resize, the original bar
  recedes and the shape following your pointer carries the real bar's name, progress and milestone
  shape — one thing moving, instead of a bar plus a floating rectangle.
- **A date follows the cursor.** A guideline and a chip show the date you are actually choosing,
  through every gesture and while simply scrubbing the canvas. It states the datum in question —
  the tentative finish while dragging a bar's right edge, the start while dragging its left or
  moving the whole bar, the span and duration while drawing a new one. The number is read from the
  same place the edit is committed from, so it cannot disagree with what you get.
- **Start and finish dates on every bar** (new `Dates` toggle in `View▾`) — drawn flanking the bar,
  left and right, so they stay legible at any bar width.
- **Float and drift as tails** (new `Float & drift` toggle) — a hollow, hatched tail extending right
  for total float and left for drift, in the same time-scale as the bar, so slack is comparable
  between two activities at a glance. Drift is only ever non-zero in Visual mode or where a
  constraint pushes an activity later; in Early mode everything is already as early as logic
  allows, so no drift tail appears — that is correct, not missing.
- **Relationship slack** (new `Link slack` toggle) — the gap each tie leaves, shown on the
  **selected** activity's own links, answering "why is this waiting?" without papering the whole
  network in numbers.

The three new `View▾` toggles ship **off**: measuring the date labels at 2,000 activities could not
certify they stay inside the canvas's draw-time budget, and an uncertified cost should be a choice
rather than something imposed on every plan. They are one click away for anyone who wants them.

Frontend only — every value shown was already computed and sent by the scheduling engine, so
nothing about how schedules are calculated has changed. Set `VITE_CANVAS_LIVE_FEEDBACK=false` for a
byte-for-byte rollback to the previous canvas.
