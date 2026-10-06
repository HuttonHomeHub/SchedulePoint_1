# M1a census (estate polish, 2026-10-06)

Derived from `RESTING_POINTER_INERT_EXCEPTIONS` in `submit-guard.structural.test.ts` (as it stood at
the branch point) and re-read against each file. Spelling counts come from
a throwaway script reusing the gate's tag reader: comments stripped, `.test.` files excluded, `apps/web/src`.

## 1. Recount

- `aria-disabled:opacity-*` / `aria-disabled:hover:*` spellings: **76 occurrences in 57 files**
  (`.ts` and `.tsx`, constants included). The plan's "my grep 57 files / 63" matches on files; the
  occurrence count is higher because the pattern here also counts `aria-disabled:hover:` pairs.
- `SHADED_BUTTON` (`ActivityProgressPanels.tsx:309`) is a constant, so the tag reader cannot see its
  `aria-disabled:pointer-events-none`. Classified in section 4.

## 2. The fifteen

Class: R = resting, T = transient, M = mixed (resting term plus a request in flight). "Submit" marks
the five `type="submit"` sites. Reason visible = on screen as text (not `sr-only`, not `title`).
Outcome: **A** reachable reason, **B** stays pointer-inert with a stated reason, **C** accepted no-op.

| #   | Site                                             | Bound expression                                          | Class | Reason exists                                       | Visible / mechanism                                                   | Outcome                                                                                                                                                         | Change made                                                                                                                                  |
| --- | ------------------------------------------------ | --------------------------------------------------------- | ----- | --------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `ui/scope-save-bar.tsx` (submit)                 | `!gate.writable \|\| !dirty \|\| pending`                 | M     | yes (gate reason, dirty/saved text)                 | visible text, `aria-describedby`                                      | A                                                                                                                                                               | pointer class -> `aria-busy:pointer-events-none`; `onClick` already refused                                                                  |
| 2   | `AuditEventList.tsx` Load more                   | `!hasNextPage \|\| isFetchingNextPage`                    | M     | label states it ("All events shown")                | the label itself                                                      | C (end of list, no-op click)                                                                                                                                    | -> `aria-busy:pointer-events-none`; handler already refused                                                                                  |
| 3   | `AuditFilterBar.tsx` Clear filters               | `empty`                                                   | R     | none needed (nothing to clear)                      | n/a                                                                   | C                                                                                                                                                               | pointer class dropped; handler already refused                                                                                               |
| 4   | `CalendarFormDialog.tsx` (submit)                | `isPending \|\| blockedByOrgPermission`                   | M     | yes (`ORG_TIER_DENIED_MESSAGE`)                     | visible beside the Scope field; not `aria-describedby`-linked to Save | A (reason is on screen, not linked)                                                                                                                             | new `submitBlocked`; `onClick` preventDefault; form `onSubmit` guards; `aria-busy:` for pending                                              |
| 5   | `CalendarsTable.tsx` Clear filters               | `!filtered`                                               | R     | none needed                                         | n/a                                                                   | C                                                                                                                                                               | pointer class dropped; handler already refused                                                                                               |
| 6   | `ClientsTable.tsx` Clear filters                 | `!filtered`                                               | R     | none needed                                         | n/a                                                                   | C                                                                                                                                                               | pointer class dropped. No Playwright driver exists; the unit/structural gate is the evidence                                                 |
| 7   | `NoteComposer.tsx` Add note (submit)             | `emptyBody \|\| overLimit \|\| create.isPending`          | M     | implicit (empty textarea, char count shown)         | char count visible; no sentence                                       | C (empty body is its own explanation)                                                                                                                           | new `blocked`; `onClick` preventDefault; form `onSubmit` guards; `aria-busy:` for pending                                                    |
| 8   | `NoteItem.tsx` Save (submit)                     | `emptyBody \|\| overLimit \|\| update.isPending`          | M     | implicit as above                                   | char count visible                                                    | C                                                                                                                                                               | same as 7. (The old exception text said "while the edit is unchanged"; unchanged is NOT blocked)                                             |
| 9   | `ResourcesTable.tsx` Clear filters               | `!filtersActive`                                          | R     | none needed                                         | n/a                                                                   | C                                                                                                                                                               | pointer class dropped; handler already refused                                                                                               |
| 10  | `ArrangeDialog.tsx` Confirm                      | `shadeReason !== null \|\| pending`                       | M     | yes (`shadeReason`)                                 | visible text, `aria-describedby`                                      | A                                                                                                                                                               | -> `aria-busy:pointer-events-none`; handler already refused                                                                                  |
| 11  | `BulkSelectionBar.tsx` actions                   | `!gate.enabled \|\| busy`                                 | M     | yes (the one status line)                           | visible, `aria-describedby` when blocked                              | A                                                                                                                                                               | -> `aria-busy:`; handler already refused                                                                                                     |
| 12  | `CreateActivityPopover.tsx` Add to plan (submit) | `saving \|\| !trimmed`                                    | M     | yes ("Enter a name to add this activity.")          | visible text, `aria-describedby`                                      | A                                                                                                                                                               | -> `aria-busy:`; `onClick` already refused; form `onSubmit` now guards `blocked` (was `if (trimmed)`, so Enter while saving committed twice) |
| 13  | `LinkChainDialog.tsx` Confirm                    | `refusal !== null \|\| pending`                           | M     | yes (refusal / error notice)                        | visible `NoticeStrip`, `aria-describedby`                             | A                                                                                                                                                               | -> `aria-busy:`; handler already refused                                                                                                     |
| 14  | `TsldPanel.tsx` Draw the first activity          | `!editingEnabled`                                         | R     | yes ("Start editing this plan to draw activities.") | **`sr-only` only**; no visible text, no touch mechanism               | C (accepted, stated): reason is announced via `aria-describedby` but a sighted pointer user gets no text. Candidate follow-up: a visible sentence in the notice | pointer class dropped; handler already refused                                                                                               |
| 15  | `WbsBulkAssignBar.tsx` Assign                    | `!gate.writable \|\| changes.length === 0 \|\| isPending` | M     | yes (the one status line)                           | visible, `aria-describedby`                                           | A                                                                                                                                                               | -> `aria-busy:`; handler already refused                                                                                                     |

Stays pointer-inert (outcome B): none of the fifteen. Where a site's `aria-busy` is bound to a
transient flag, `aria-busy:pointer-events-none` keeps the in-flight part inert.

`CreateActivityPopover`'s Cancel (`aria-disabled={saving}`) is transient and keeps
`aria-disabled:pointer-events-none`.

Submit note: `ScopeSaveBar` is a component, so it cannot guard its eight callers' `onSubmit`. It does
not need to: the browser's implicit submission (Enter in a field) is a click on the form's default
button, which `onClick` refuses.

## 3. Newly dimming `<Button>`s (bind `aria-disabled`, no shading today)

Found by the same tag reader: every `<Button>` with an `aria-disabled` binding and no
`aria-disabled:opacity` in its tag (constants are checked by hand).

| Site                                              | Expression                                        | Decision                                                                                                                                                                                        |
| ------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout/status/plan-facts.tsx` Recalculate        | `state.refusal ? true : undefined`                | intended: a refused Recalculate with a reason (`title`, `aria-describedby`)                                                                                                                     |
| `AcceptInvitationCard.tsx` Sign out               | `signOut.isPending`                               | intended: in-flight shading; handler already refuses                                                                                                                                            |
| `AcceptInvitationCard.tsx` Accept                 | `accept.isPending`                                | intended: as above                                                                                                                                                                              |
| `RecentlyDeletedTable.tsx` Restore                | `restoringIds.has(id)`                            | intended: in-flight shading; the row already sets `aria-busy`                                                                                                                                   |
| `ImportScheduleDialog.tsx` Confirm import         | `!canConfirm`                                     | already dims (`opacity-50` when blocked); now 60 through the CVA. Intended                                                                                                                      |
| `AssignmentRow.tsx` Save join delay               | `lagUnavailable \|\| undefined`                   | already dims (`pointer-events-none opacity-50` from its own class). Resting, pointer-inert and not among the fifteen (class is conditional, outside the gate's reach): left for M1b / follow-up |
| `ActivityProgressPanels.tsx` x4 (`SHADED_BUTTON`) | `!gate.writable`, `index === 0`, `index === last` | already shaded (constant). **Resting and pointer-inert, hidden from the gate by the constant.** Per-site class to use in M1b: drop the pointer class; the four onClick handlers already refuse  |

`ConfirmDialog`'s confirm and the auth submits carry their own `aria-disabled:opacity-50` (transient);
`cn` keeps the caller's value over the CVA's, so they stay at 50 until M1b deletes the caller strings.

## 4. `buttonVariants()` consumers that are not `<Button>`

Ten anchors (`OrganisationEmptyState`, `InviteExitLinks`, `AcceptInvitationCard`, `forgot-password`,
`reset-password`, `verify-email`). None binds `aria-disabled`, so they gain nothing visible; the gated
hover only affects `aria-disabled` elements.

## 5. Built-CSS evidence for `not-aria-disabled:`

`pnpm --filter @repo/web build` (Tailwind 4.3.3), then in `apps/web/dist/assets/index-*.css`:

```
.not-aria-disabled\:hover\:bg-accent:not([aria-disabled=true]):hover{background-color:var(--accent)}
.not-aria-disabled\:hover\:bg-destructive-hover:not([aria-disabled=true]):hover{background-color:var(--destructive-hover)}
.not-aria-disabled\:hover\:bg-primary-hover:not([aria-disabled=true]):hover{background-color:var(--primary-hover)}
.not-aria-disabled\:hover\:bg-secondary-hover:not([aria-disabled=true]):hover{background-color:var(--secondary-hover)}
.not-aria-disabled\:hover\:text-accent-foreground:not([aria-disabled=true]):hover{color:var(--accent-foreground)}
.aria-disabled\:opacity-60[aria-disabled=true]{opacity:.6}
```

It compiles to the expected `:not([aria-disabled=true]):hover`, so no restatement fallback was needed.

## 6. Surface sheet

`docs/specs/gantt-coarse-pointer/device-checklist.md` is not affected: none of the fifteen is rendered in
the Gantt view, and the only `<Button>` the Gantt owns (row dots, `GanttRowMenu.tsx`) never binds
`aria-disabled`. The columns **Reset** (`gantt-columns-group.tsx`) loses its hover fill while shaded; no
sheet step touches it.
