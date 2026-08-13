# M2 — the gate pass

**Deviation, stated up front.** §20 routes a UI change through the `ux-reviewer`,
`accessibility-reviewer` and `component-reviewer` subagents. **This session is configured not to
launch agents**, so the review below was done inline against the diff. That is a weaker instrument
than four independent readers and it is recorded as such rather than presented as equivalent — the
register's last five enablement passes each found blocking defects a human read had missed, and the
common factor was that the reader was not the author. **Recommendation: re-run the three specialist
gates over this diff in a session that can launch them, before or shortly after merge.** The change
is a removal behind two verified-red gates, which is why that is a recommendation and not a blocker.

---

## The specific risk the plan named

> "Whether removing the item leaves any surface where a Contributor sees only shaded controls. That
> is the failure the original Row 2 placement existed to prevent, and it is the one this change
> could reintroduce."

**Checked against the code rather than reasoned about. It does not materialise.**

Row 2 after the removal, for a **Contributor** (`canProgress` and `canWriteNotes` true via
`PROGRESS_REPORTER_ROLES` / `NOTE_WRITER_ROLES` in `lib/rbac.ts:23,42`; `canWrite` false, so
`canEditSchedule` false):

| Item                                                                                  | State for a Contributor                    |
| ------------------------------------------------------------------------------------- | ------------------------------------------ |
| `add-note`                                                                            | **live** — `canWriteNotes`, not pen-gated  |
| `comments`                                                                            | **live** — a read                          |
| `analysis`                                                                            | **live** — a read                          |
| `export`                                                                              | **live** — a read                          |
| `calendar`                                                                            | **live** — schedule settings, a read       |
| `marquee-select`                                                                      | **live** — selecting is a read (ADR-0080)  |
| `add-activity`, `link-tool`, `auto-arrange`, `clear-visual-placement`, `undo`, `redo` | shaded, pen-gated                          |
| `recalculate`                                                                         | shaded — `canRecalc` (`plan-gating.ts:45`) |

Six live controls remain, and the Contributor's own action is on the dock the moment they select
something. The 2026-07 reason for the inline placement was that a Contributor must not meet a
surface of refusals; that is still true of this surface, and the action itself moved closer to them
rather than further away.

## Accessibility

- **No orphaned description.** The removed item owned its own `disabledReason` strings; nothing else
  referenced them, and `aria-describedby` on this surface is generated per item by
  `ToolbarButton`. Confirmed by the compiler after deleting `openProgress` / `canProgress` from the
  context type: the only fallout was in tests, which is what a self-contained removal looks like.
- **The `⋯` disappears from Row 2 at 1646** (`m0-measurements.md` T2). That removes one roving-tabindex
  stop and makes every Row 2 command directly reachable rather than one level down a menu — a strict
  improvement for keyboard and pointer alike. `e2e-toolbar-fit` passes all five assertions including
  the WCAG 2.2 `target-size` scan and the coarse-pointer projection.
- **The dock item's shading is unchanged.** It keeps ADR-0082's shape (`aria-disabled` plus a linked
  reason), which is what makes it the right survivor: the removed item and this one were both
  correct, and only one of them was on the object.
- **Not covered by this review:** real assistive-technology announcement of the dock item in the
  docked position. Reasoned from markup, not observed. Flagged rather than claimed.

## UX

- **The label discrepancy is resolved by deletion, not by a rename.** The two copies read
  `Report progress…` and `Report progress`; the survivor matches the activities-table row action and
  the dialog title, so the product now says one thing in three places.
- **One consequence worth stating and not burying** (also in the ADR and the measurements): the
  command promoted into the vacated Row 2 slot is `clear-visual-placement`, which is one of the two
  write affordances still reachable from a **Gantt** selection. This change makes it _more_
  prominent. It does not change Q2's disposition — that goes to the Gantt-editing epic — but the
  epic should not discover it as a surprise.
- **No copy was written**, so there is nothing to review for tone. That is itself the point of the
  change.

## Component / API surface

- `TsldToolbarContext` loses two members (`canProgress`, `openProgress`); `useTsldToolbarContext`
  stops destructuring `canProgress` / `onProgressActivity` from the model. **The model keeps both** —
  the dock (`plan-workspace-toolbar.tsx:520,522`) and the activities panel
  (`activity-bottom-panel.tsx:110`) are their real consumers, and cutting them would have been the
  over-reach this kind of removal invites.
- **Caught by lint, not by review**: after the first pass the two names were still hook inputs and
  still in a `useMemo` dependency array, doing nothing. `react-hooks/exhaustive-deps` named them as
  unnecessary dependencies. Fixed; that is the reviewer the repo actually has for this class.
- The new structural test imports from both registries and adds no production dependency.

## Tests

- `selection-duplication.structural.test.ts` — **verified red first** (2 failed against the
  pre-removal tree, with the offending item named in the failure output).
- `progress-entry.spec.ts` — **verified red first** (`Expected: 0, Received: 1` on the
  command-surface assertion).
- Five cases were deleted from `tsld-toolbar-quick-wins.test.tsx` and each was checked against what
  survives elsewhere rather than assumed covered — the ADR-0084 D5 rule, which this repository has
  recorded getting wrong by claiming coverage that did not exist. The equivalent gates live in
  `selection-actions.entry-routes.test.tsx` (the dock item's role gate) and `ActivitiesTable.test.tsx`
  (the row action's), both pre-dating this change and passing unchanged.
- Deliberately **not** replaced with an "item is absent" case in that file: absence is pinned once,
  structurally. A second copy of that assertion in a behaviour suite is how a roster starts drifting.
- Full web unit suite: **474 files / 4749 tests green.**
