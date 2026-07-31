---
'@repo/web': patch
---

Fix five defects found by the canvas authoring & routing enablement reviews: the link confirmation
no longer replays a stale "Linked A → B" (with an Undo bound to a different edit) the next time the
Link tool is armed; the Add and Link split buttons return focus to their operable half rather than
the caret, which is outside the tab order; pointer-driven link picks and pick-drops are announced,
including the recalculation-cap drop nobody asked for; and Cancel in the create popover no longer
looks and behaves enabled while announcing "unavailable" during a save it cannot abort.
