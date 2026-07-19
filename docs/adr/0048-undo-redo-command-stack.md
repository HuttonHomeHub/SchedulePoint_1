# ADR-0048: Client-side command-stack undo/redo for plan authoring

- **Status:** Accepted
- **Date:** 2026-07-19
- **Deciders:** Product owner + engineering

## Context

The TSLD canvas is the primary, default-on authoring surface (create / move / relane / link / edit /
constrain / delete; Visual-mode `visualStart` drags). It has **no undo** — the defining missing
capability of a direct-manipulation editor, and a MoSCoW Must-have (ROADMAP "Next"). ADR-0028 named
undo/redo as the unblocked-but-out-of-scope follow-on to the pen.

The forces that shape the design:

- **Engine-owned batched write (ADR-0022):** `recalculate` writes the derived columns (early/late
  dates, floats, critical, violation/leveling/external flags) in one batch that **bypasses optimistic
  locking**. Those are **outputs**, not user inputs — they must never be "undone" directly.
- **Optimistic locking (ADR-0022 / per-entity `version`):** structural writes carry a version and can
  409 if the row moved.
- **Single-editor pen (ADR-0028):** one editor per plan (lease + heartbeat + 423 write-gate).
- **Coalesced auto-recalc (ADR-0032):** structural edits already trigger a debounced client recalc.
- **Existing mutation surface:** every edit already flows through per-entity REST mutation hooks with
  the standard envelope, behind RBAC + org-scope + pen + optimistic gates.
- **Rollout convention:** flagged, default-off, byte-identical when off.

## Decision

We will implement undo/redo as a **client-side, per-plan, per-pen-session, in-memory command stack**
that **undoes plan _inputs_ only**, composing inverses from the **existing** REST mutations, and lets
the ADR-0032 auto-recalc redraw. Behind `VITE_UNDO_REDO` (default off).

Concretely:

- **Command model.** Each structural edit records a `Command { label, do(), undo() }` whose inverse is
  built from the pre-edit value the mutation hook already holds. Undo pops the stack and runs the
  inverse; redo re-runs `do()`. History is **linear** — any new edit clears the redo stack.
- **Inputs only — the load-bearing rule.** Undo never reads, writes, or reconstructs engine-owned
  derived columns. It replays the structural input change and the **normal recalc** recomputes the
  outputs. So the CPM engine and the recalc **parity gate are structurally untouched** (this feature
  can't regress them).
- **Reuse the API + its gates.** Every inverse is an ordinary mutation through the unchanged
  `assertHoldsPen` (423) + RBAC (`activity:*` / `dependency:*`) + org-scope + optimistic `version`
  gates. The API stays the sole trust boundary; the client stack is a convenience that **cannot
  escalate** — it can only re-issue writes the user may already make.
- **Conflict = abort-and-refetch.** If an inverse returns 409/404 (row moved/deleted by a later edit or
  by recalc), undo aborts non-destructively, refetches server truth, clears redo, and shows a
  `role="status"` message. No silent skip, no auto-retry, no client-side merge. A 423 (pen lost) clears
  the stack.
- **Bounded & session-scoped.** Depth cap **50**; scoped per plan + pen session; cleared on plan switch,
  pen release, and reload. No schema, no migration, no new endpoint (M1–M3).
- **Delete-undo.** M1–M2 undo a leaf delete by **re-creating** it (new id, zero backend). Id-stable /
  cascade-clean delete-undo is deferred to an **optional M4** that reuses the existing soft-delete +
  `deleteBatchId` columns via one **additive** restore endpoint (still no schema change).
- **Surface.** Toolbar Undo/Redo in the ADR-0031 registry (pen-gated group) + scoped keybindings
  (`Cmd/Ctrl+Z`, `Cmd/Ctrl+Shift+Z` / `Ctrl+Y`) that suppress browser Back/Forward (TECH_DEBT #25),
  with live-region announcements.

## Alternatives considered

- **Server-persisted undo log.** Survives reload and could be shared across sessions, but adds tables,
  endpoints, and cross-session/cross-editor reconciliation for little v1 value — the pen already makes
  editing single-writer per plan. Rejected for v1; the client model leaves the door open to add one
  later without reworking the command layer.
- **Full-plan snapshot per edit + diff on undo.** Conceptually simple, but stores a full plan copy per
  step and still needs the same conflict story on apply. Heavy and no simpler where it counts. Rejected.
- **Undo the engine outputs too (store/restore computed columns).** Fights ADR-0022 (the batched,
  lock-bypassing write), risks diverging from a real recalc, and would entangle undo with the parity
  gate. Rejected — recompute, don't restore.

## Consequences

- **Positive:** editing becomes reversible with no schema/API/engine change for M1–M3; the parity gate
  is safe by construction; each inverse is authorised server-side exactly like a first-class edit; the
  feature ships dark and flips on only when its gates are green.
- **Negative / accepted:** history is **lost on reload and on pen hand-off** (in-memory, per session);
  a leaf delete-undo **changes the activity id** until M4; **cascade/WBS delete-undo is not clean**
  until M4 (M2 truncates history past a cascade delete); keybindings need the same cross-browser
  Back/Forward suppression sweep the TSLD-editing flag required.
- **Neutral / follow-up:** progress edits are **out of scope** (Contributor-writable / non-pen-gated —
  folding them in would break the single-writer assumption); revisit if wanted. M4 (id-stable restore)
  is optional and separately reviewed (database-architect + security + backend-performance).

## References

- ADR-0022 (engine-owned batched write / optimistic locking), ADR-0028 (plan edit-lock),
  ADR-0031 (toolbar registry), ADR-0032 (coalesced auto-recalc), ADR-0033 (`visualStart`)
- TECH_DEBT #25 (Back/Forward suppression for editing keybindings)
- `docs/specs/undo-redo/feature-spec.md` + `docs/specs/undo-redo/implementation-plan.md`
