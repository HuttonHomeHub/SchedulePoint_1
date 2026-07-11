---
'@repo/web': minor
---

Complete the Time-Scaled Logic Diagram's keyboard **edit** model (M8 M5, slice 5.2; behind
`VITE_TSLD_EDITING`). Keyboard users can now reposition an activity **in time** — `Alt+← / Alt+→`
nudges its start one day earlier / later (an SNET constraint that recalculates) — alongside the
existing `Alt+↑ / ↓` lane move, and press **`n`** to create an activity pre-filled at the focused
lane and start. A **held** Alt+arrow is now coalesced into a single net write per burst (with an
optimistic preview) and writes are serialized, so holding a key smoothly moves several lanes/days
and issues one PATCH at the current version instead of racing several — which also removes the
self-inflicted "changed elsewhere" conflicts a fast key-repeat used to cause. An `Alt+↑` at the top
lane now says "Already in the top lane." rather than silently doing nothing. The in-app keyboard
shortcuts help lists the new edit keys.
