---
'@repo/web': minor
---

feat(web): time-true TSLD link anchoring + arrowheads (canvas direct manipulation M1, ADR-0052)

First slice of the canvas direct-manipulation upgrade, behind `VITE_CANVAS_DIRECT_MANIPULATION`
(default **off**). When on, every dependency link renders **time-true**:

- Each end anchors at the point in time its lag actually constrains — `lagDays` walked from the
  constrained edge on the relationship's **lag calendar** (plan working days; `TWENTY_FOUR_HOUR`
  lags walk elapsed days — ADR-0036 §6), a lead (negative lag) walking left. FS/FF shift the
  successor anchor from the predecessor's finish; SS/SF embed the anchor along the predecessor bar
  (the GPM embed point). Zero-lag ties keep today's endpoints; anchors clamp to their bar's span;
  null computed dates fall back to the extreme-end routing.
- Links carry a directional **arrowhead** at the successor end (batched fills, edge colour — the
  driving weight/dash emphasis is retained, never colour alone).
- The working-day walk is a pure, injected, memoised and horizon-bounded helper
  (`makeWorkingDayWalk`), keeping the render model CPM-free and the draw cost O(visible edges).
- `summarizeLogic` speaks a lagged driving tie ("SS + 3 working days") via the new `lagPhrase`;
  zero-lag sentences are unchanged.

Render-only — no gestures, no writes, no API/schema/engine change (the recalc parity gate is
untouched). Flag-off paints byte-for-byte today's canvas (parity paint test). Records ADR-0052.
