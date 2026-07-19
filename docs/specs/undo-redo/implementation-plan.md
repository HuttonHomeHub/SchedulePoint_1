# Implementation Plan: Undo / Redo (plan authoring)

- **Feature spec:** `docs/specs/undo-redo/feature-spec.md` (Approved)
- **ADR:** `docs/adr/0048-undo-redo-command-stack.md`
- **Flag:** `VITE_UNDO_REDO` (default off; byte-identical when off)
- **Guiding rule:** undo replays plan **inputs** via existing endpoints, then the ADR-0032 recalc
  redraws. The CPM engine and the recalc **parity gate are never touched**.

## Epic

Give plan authoring reversible edits — a bounded, client-side, per-plan+pen-session command stack with
undo/redo over structural edits, surfaced as toolbar items + keybindings, shipped behind
`VITE_UNDO_REDO` and flipped on once the a11y/component/e2e gates are green.

## Milestone M0 — flag + ADR (foundation)

- **M0.1** Add `UNDO_REDO_ENABLED = flagDefaultOff(import.meta.env.VITE_UNDO_REDO)` to
  `apps/web/src/config/env.ts` with a documented comment; add `ADR-0048` to the CLAUDE.md §16 list.
  _Complexity: S. Risk: none. Tests: env flag default test._

## Milestone M1 — command model + history store + first commands (dark)

Proves the architecture end-to-end on the safest edits.

- **M1.1 — `Command` model + inverse builders.** `features/undo-redo/commands.ts`: a `Command`
  type (`label`, `do()`, `undo()`), and pure inverse builders for **reposition**, **relane**, and
  **update** (rename/duration/constraint) — each captures the pre-edit value from the args the hook
  already has. _Complexity: M. Risk: getting the inverse exactly right. Tests: unit round-trip
  (do→undo→do restores state) per command._
- **M1.2 — `usePlanEditHistory` store.** Bounded (50) per-plan+pen in-memory stacks; `push`, `undo`,
  `redo`, `clear`, `canUndo`, `canRedo`; redo cleared on push; cleared on plan change / pen loss.
  _Complexity: M. Risk: lifecycle correctness. Tests: push/undo/redo/clear + depth-cap + redo-invalidation._
- **M1.3 — record at the workspace-model seam.** Wrap `use-plan-workspace-model`'s reposition/relane/
  update handlers so each records its command (behind the flag). No visible UI yet (dark). _Complexity:
  M. Risk: not double-recording the recalc. Tests: seam records one command per edit; flag-off = no record._

_M1 exit: unit-green; flag-off byte-identical; no user-visible surface._

## Milestone M2 — full command coverage + coalescing (dark)

- **M2.1 — create / delete-leaf commands.** Undo a create = delete it; undo a leaf delete = **re-create**
  it (new id — the conservative rule; ADR-0048). _Complexity: M. Tests: create/delete round-trip._
- **M2.2 — dependency add/remove + `visualStart` commands.** _Complexity: M. Tests: link + visualStart
  round-trip._
- **M2.3 — coalescing + batch collapse.** A pointer drag / nudge burst = one command; auto-arrange and
  WBS/cascade delete collapse to one step; **cascade delete truncates history past it** in M2 (clean
  restore is M4). _Complexity: M. Risk: coalescing boundaries. Tests: a drag yields one undo step;
  auto-arrange undoes in one._

_M2 exit: full structural coverage, still dark._

## Milestone M3 — flag-on surface: conflict contract, controls, a11y

- **M3.1 — conflict + pen-loss contract.** 409/404 → abort + refetch (`scheduleKeys`/activity invalidate)
  - clear redo + `role="status"`; 423 → clear stack + status. _Complexity: M. Risk: matching the existing
    refetch patterns. Tests: 409/404/423 branches._
- **M3.2 — toolbar Undo/Redo + keybindings.** ADR-0031 registry items (pen-gated group), disabled from
  `canUndo`/`canRedo`; `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z` (+ `Ctrl+Y`) with Back/Forward suppression
  (TECH_DEBT #25). Announce each undo/redo via `useAnnounce`. _Complexity: M. Risk: key collisions.
  Tests: component (gating/disabled/labels), keybinding suppression._
- **M3.3 — reviews + gates + flip.** ux + component + accessibility reviewers; flag-on Playwright journey
  (`playwright.undo.config.ts`, wired into CI); cross-browser Back/Forward sweep; then flip
  `VITE_UNDO_REDO` default-on. Changeset (`@repo/web` minor). _Complexity: M. Tests: full gate + journey._

_M3 exit: on by default, gates green, journey in CI._

## Milestone M4 — id-stable / cascade-clean delete-undo (optional, additive)

- **M4.1 — restore endpoint.** database-architect + security-reviewer + backend-performance-reviewer on
  an additive `POST …/activities/:id/restore` (batch/subtree) reusing soft-delete + `deleteBatchId`
  (no schema change). _Complexity: M–L. Tests: API e2e (RBAC, 423, cascade)._
- **M4.2 — swap delete-undo to restore-by-id.** Replace the M2 re-create inverse with id-stable restore;
  remove the cascade-truncation rule; update ADR-0048 amendment note. _Complexity: M. Tests: cascade/WBS
  delete-undo round-trip keeps ids._

## Build-time agents

- **M3:** component-reviewer, ux-reviewer, accessibility-reviewer (toolbar, keybindings, focus,
  announcements); test-engineer (round-trip / coalescing / conflict + flag-on Playwright).
- **M4 only:** database-architect + security-reviewer + backend-performance-reviewer on the restore endpoint.

## Risks

- Inverse correctness (mitigated by round-trip unit tests per command).
- Leaf delete-undo changes the id until M4 (accepted; documented).
- Cascade/WBS delete-undo not clean until M4 (M2 truncates).
- Keybinding vs browser Back/Forward and `Alt+←/→` nudge — needs the cross-browser sweep the TSLD
  editing flag required.
- History lost on reload / pen hand-off (accepted for v1).
