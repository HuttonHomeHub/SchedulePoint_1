---
'@repo/web': minor
---

feat(web): canvas-first authoring — two-click Link tool replacing edge-drag (ADR-0032, M5)

Behind `VITE_CANVAS_AUTHORING` (default-off): a new `'link'` edit mode is the canvas-first way to
draw dependencies — click a predecessor, then a successor — with the dependency kind (**FS / SS /
FF**) chosen from a toolbar selector instead of a keyboard chord. The picked predecessor rings on
the interaction layer while the tool waits for the second click; Escape drops the pick, a second
Escape leaves the tool. The flag suppresses the edge-handle rubber-band affordance so edge-drag is
replaced, not duplicated.

Flag-off the edge-drag linking path (Shift = SS, Alt = FF) is unchanged byte-for-byte. Frontend
only; no API/DB change.
