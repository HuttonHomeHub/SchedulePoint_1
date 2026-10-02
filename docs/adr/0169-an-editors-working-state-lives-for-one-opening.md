# ADR-0169: An editor's working state lives for one opening

- **Status:** Accepted (M0–M4 landed 2026-10-01 to 2026-10-02)
- **Date:** 2026-10-01 (accepted 2026-10-02)
- **Deciders:** James Ewbank (product owner — CQ-1 (b), CQ-2 (b), CQ-3 (a) and NQ-1 (b) answered on
  2026-10-01; chose to continue after M0's stop gate fired), with Claude Code
- **Amends:** ADR-0060 §4 (who owns a scope's form), ADR-0108 D2 (the Progress panels' dirtiness is read,
  not reported)
- **Completes:** ADR-0101 (an editor is a dialog, not a drawer) — D5 retired the shell it left behind
- **Spec:** [`docs/specs/activity-editor-seeding/`](../specs/activity-editor-seeding/feature-spec.md) (§4.9
  is this ADR's outline; the measurements are in
  [`m0-measurement.md`](../specs/activity-editor-seeding/m0-measurement.md)). Register row:
  `docs/TECH_DEBT.md` #420, closed by this epic; F5 is #430.

## Context

#420's sibling pass (#749) gave eight dialogs forms that are created per opening. The activity editor and
**New activity** were left mounted-and-toggled, because their close guard reads form state from outside
the dialog's children. Reading the code found three consequences of that lifetime, and the Progress
panels' self-owned forms produced a fourth that ADR-0108 D2's reporting shape concealed:

- **F1** — a discarded draft leaves a confirmation armed for the next opening.
- **F2** — "Saved." and a scope's save error survive into the next opening.
- **F3** — New activity's hidden-field alert survives into the next opening.
- **F4** — a Progress draft is destroyed by a tab switch while the editor still claims it.

M0 measured the typed-input window (a keystroke lost to a `reset()` in a passive effect keyed on `open`)
before anything was built. It is **red** on the two mounted-and-toggled dialogs and **not** on a panel
mounted by a tab click, whose re-render completes inside the click's own flush. So the window is a
property of **a form whose `open` flips**, which is what D1 removes; and all four F-findings reproduce
(F1 and F4 also in Chromium). Whether a real driver's `fill` ever lands inside the window is **not
measured** — the fix stands on construction and on F1–F3, not on a recorded flake.

## Decision

- **D1 — Working state is born per opening.** A dialog that edits records mounts its forms, transient
  flags and confirmations inside the dialog's children; closing ends them. No reset-on-open effect.
- **D2 — The frame keeps what must outlive an opening:** the `<dialog>` element (so focus on open and on
  close is unchanged), the mutations (a save completing after close still records undo and announces), and
  the title.
- **D3 — The close guard is reached through a handle, not lifted state.** The frame forwards
  `requestClose` to the mounted session via `useImperativeHandle`; no session mounted means the dialog is
  closed. A guard fed by a child reporting `isDirty` through an effect is one render late by construction.
- **D4 — A scope's form is owned by the editor session, never by the panel that renders it.** Amends
  ADR-0060 §4 (forms per scope — unchanged in number, changed in owner) and supersedes ADR-0108 D2's
  reporting mechanism: dirtiness is read, not reported. Panels are presentational.
- **D5 — The shell and the subject guard are retired; the editor is a modal, hard-wired.** Completes
  ADR-0101's reversal of the Graphite M6 drawer: the `shell` render prop, `modalShell`, `tabRailAllowed`
  and `onSubjectHeld` existed for a non-modal host that no longer exists, and the subject guard was
  reachable only through one (ADR-0108 D7). All four are deleted. The session is keyed by the activity id
  (`ActivityEditorDialog.tsx`, `key={activity.id}`), so a subject change — unreachable — remounts rather
  than mixing two activities. A future non-modal editor host must design its own guard; this ADR did not
  pre-build it.
- **D6 — No flag** (ADR-0088 D1); the rollback is the commit boundary.

## Alternatives considered

- **The hook-only fix** — `keepFieldsRef` on `useScopeForm`'s open reset. Closes the window; leaves
  F1–F4.
- **Keep the Progress panels mounted while hidden.** Makes Progress the one tab whose content lives
  outside `Tabs`'s single panel and changes a shared primitive's usage contract for one consumer
  (CLAUDE.md §19.13) to buy what ownership buys without one.
- **Keep the shell and the guard (NQ-1 (a)).** Smaller; preserves a tested path no production host can
  reach.

## Consequences

- Two panel suites are rewritten through a harness and four no-chrome suites are rewritten or retired;
  `ActivityEditor`, `ActivityEditorShell` and `modalShell` leave the feature's exports; `useScopeForm`
  loses `open` and every effect.
- Future editor state is per-opening by default; anything that must persist across openings has to be put
  in the frame on purpose.
- Closing mid-save discards the form state by design; the write, its undo record and its announcement
  survive (D2).
- F5 (a successful save's `reset(values)` wiping text typed while the save was in flight) is not changed
  by this ADR and is filed as `docs/TECH_DEBT.md` #430.
- `ActivityResourcesPanel`'s mount-time reset-to-its-own-defaults is deleted as a cleanup (M1, CQ-3 (a)):
  M0 found it redundant, and its Resources probe stays green as the regression guard.

## References

- `docs/TECH_DEBT.md` #420; PR #749 (the eight sibling dialogs).
- ADR-0060, ADR-0061, ADR-0062, ADR-0101, ADR-0108, ADR-0135, ADR-0048, ADR-0088, ADR-0111.
