---
'@repo/web': minor
---

feat(web): mount the floating TSLD selection-actions bar (ADR-0031)

Selecting an activity on the TSLD canvas now shows a small **floating toolbar** just above it with
its object actions — **Open logic**, **Edit activity**, **Delete activity** — so the common actions
are where the planner's attention already is, while the main toolbar stays stable (ADR-0031, Fork-2;
resolves TECH_DEBT #31a — the bar was built + unit-tested but not previously mounted).

- The bar follows the canvas **imperatively**: the canvas writes the selected activity's live
  viewport anchor to a ref each frame (ADR-0026 D3 — no per-frame React state) and the bar reads it
  on its own `requestAnimationFrame` to reposition, so pan/zoom track without re-rendering the
  toolbar. It flips below the selection when there's no room above, and hides when the selected bar
  scrolls off-screen or the pane is hidden.
- Mutating actions (Edit / Delete) are **pen-gated as a set** (disabled with a reason) exactly like
  the main toolbar; **Open logic** stays available read-only. Edit/Delete open host-owned dialogs via
  a new shared `ActivityCrudDialogs`, keeping the tsld feature dependency-free (ADR-0026 D8).
- The redundant **"Set constraint"** action was dropped (it duplicated Edit; there is no dedicated
  quick-constraint editor).

No other capability changes — Open logic / Edit / Delete remain reachable from the parallel listbox
and the activities table.
