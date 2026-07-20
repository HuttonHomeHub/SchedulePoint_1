---
'@repo/web': minor
---

feat(web): Level of Effort (hammock) on the canvas Add flow (VITE_CANVAS_ACTIVITY_TYPES)

Turn the canvas Add split-button's two "Coming soon" placeholders (Level of effort +
Hammock) into ONE live **Level of Effort (hammock)** item that arms a two-click
endpoint-pick tool: pick a start driver, then a finish driver, and SchedulePoint
composes a `LEVEL_OF_EFFORT` activity plus its SS/FF driver edges as one undoable
action, then recalcs and redraws. Frontend-only over the already-shipped LOE
engine — no API/schema/`@repo/types`/CPM-engine change (the recalc parity gate is
untouched).

- The armed Add trigger shows "Pick start driver" → "Pick finish driver"; the item
  shades with "Add activities to span between them" below two activities; the tool
  disarms and announces on commit/cancel; a keyboard-picked start survives a
  pointer-picked finish (single-sourced pick, WCAG 4.1.3).
- A raw `HAMMOCK` is never created — SchedulePoint's LOE **is** the span-derived
  hammock (P6 vocabulary kept on the single item for discoverability).

Set `VITE_CANVAS_ACTIVITY_TYPES=false` to keep the Add menu's disabled placeholders
byte-for-byte and leave the tool unreachable (rollback / opt-out).
