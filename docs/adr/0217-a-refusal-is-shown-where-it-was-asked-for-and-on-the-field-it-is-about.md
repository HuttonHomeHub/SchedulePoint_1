# ADR-0217: A refusal is shown where it was asked for, and on the field it is about

- **Status:** Accepted — 2026-11-12. The product owner approved the spec and the plan on 2026-11-12 with all three
  defaults. D1, D3 and D4 shipped with M1 (the API names the fields) and M2 (the Progress tab's field); D2 ships with M3
  (the save bar's refusal slot and the ten callers moved onto it).
- **Date:** 2026-11-12
- **Deciders:** James Ewbank (product owner) and Claude Code.
- **Extends:** [ADR-0060](0060-tabbed-activity-editor-and-per-scope-save.md) §6 (the per-scope save bar). Restates, for the
  save bar, the rule in `components/ui/server-error.tsx` (ADR-0077 M6-T2): a refusal is announced and never takes focus.
- **Amends:** nothing. ADR-0083 and ADR-0204 (a shaded control says why) are untouched: a gate reason still explains why
  Save is inert, and a refusal is a different sentence about a different moment.
- **Spec:** [`docs/specs/progress-before-data-date/`](../specs/progress-before-data-date/feature-spec.md) §4.8 · **Plan:**
  [`implementation-plan.md`](../specs/progress-before-data-date/implementation-plan.md)
- **Builds on:** ADR-0035 §6 (N07), ADR-0111 (a primitive's keyboard contract is reviewed before release), ADR-0114
  (a row that cannot shrink is never asked to wrap), ADR-0132 (an alert is an event or a standing condition),
  ADR-0169 (an editor's working state lives for one opening), ADR-0179 (the 1024 × 600 design floor), ADR-0190.

## Context

Ten Saves in the activity editor (General, Scheduling, Cost, Reported progress, How value is measured, Weighted steps,
Codes, WBS members, Add a link, Assign resource) each rendered a refused save as a line at the **top** of their own scope,
and the Save sat at the bottom. At the 1024 × 600 design floor (ADR-0179) a scope is taller than the pane, so a reader who
scrolled to the Save and pressed it saw nothing change: the refusal was above the fold, beside nothing they were looking
at. The owner's first-time run found it on the Progress tab, where an actual date after the plan's data date is refused,
and the walkthrough measured it: the message was outside the viewport (journey `progress-refusal.spec.ts`, which fails
against the old placement on exactly that assertion).

Two callers had already noticed and each invented a different workaround: the Codes section tied its top alert to Save
with `alsoDescribedBy`, and the WBS members panel did the same and added a hand-rolled `scrollIntoView`. A third kind of
refusal is different in nature: some are about one field ("Actual finish is after the data date") and the reader must
change that field, not read a banner.

## Decision

1. **D1 — A refusal tied to a field goes on that field, and focus moves there.** The field is marked invalid, carries the
   sentence as its description, and takes focus: it is the control the reader must change, and the browser scrolls it
   into view. This is the `ChangePasswordForm` precedent. The decoded refusal is held per panel for the life of one
   opening (ADR-0169), so it is on the field when the reader comes back from another tab, and editing the field clears
   that field's error (a relation between two fields clears from either end). Focus moves only from where the
   reader pressed Save (or from nowhere): a reader who has since moved to another field, a menu or a dialog keeps their
   place and is told by the live region instead.
2. **D2 — Any other refusal is shown in the save bar, beside the Save that was pressed.** `ScopeSaveBar` takes
   `error?: { message; action? }` and renders it in the bar, above the button, as an event alert (`role="alert"`, so it
   is announced once as it appears). It **describes Save** (`aria-describedby`), so a screen-reader user who presses
   Save and hears nothing more finds the reason on the control they are on. It **scrolls the bar into view**
   (`block: 'nearest'`) once per new refusal, and it **never takes focus**: the reader's cursor is on Save, and moving
   it to an inert alert is the displacement ADR-0077 M6-T2 removed from the public forms. The optional `action` (the
   editor's **Refresh this section**) renders under the sentence, outside the alert and outside the description, so it
   is not announced twice and does not lengthen what Save is described by. The refusal replaces the "Unsaved changes" or
   "Saved." sentence while it shows, because a bar cannot honestly say both; it never replaces a gate reason, which
   explains why Save is inert and is still true. The bar is a column while a refusal shows, so the sentence gets the
   bar's full width instead of squeezing the button (ADR-0114).
3. **D3 — The server names the field(s) in `details.fields` where a rule is about fields.** Added additively in the
   progress endpoint's 422 (ADR-0190 D1/D2: no field removed or retyped). The names are activity field names and may be
   **stored values** the request did not send (an actual start already on the row), which is why a client treats them as
   "where to look", not "what you typed".
4. **D4 — The client never parses `message`.** It reads `details.reason`, `details.fields` and the dates, and words the
   sentence itself for the reader's role (a Planner is told where to move the data date; a Contributor is told to ask a
   planner). A refusal with an unknown reason, or no fields, is shown in the bar with the server's own sentence.

A refusal that sits beside its own row (a per-assignment Save on a resource row) and a failure to **load** something are
not save refusals and are unchanged: they already sit where the reader is looking, and a load failure has no Save to
describe.

## Alternatives considered

- **Scroll the existing top alert into view.** Rejected: the reader's eye and focus are at Save, and scrolling away hides
  the very field they must change.
- **Focus the alert.** Rejected by the `ServerError` rule: it unmounts nothing, so nothing needs recovering, and a focus
  move off Save is an unrequested displacement (SC 2.4.3).
- **A toast.** Rejected: transient, and a refusal must stay until the reader acts on it (UX_STANDARDS, "A failure or
  refusal is `role="alert"`, is not also announced, and stays until dismissed").
- **Keep `alsoDescribedBy` and let each caller place its own alert.** That is what produced two different workarounds and
  eight callers that did not bother. One slot is the only place a fix lands once.
- **A client-side check before sending.** Rejected as the primary path: the client's cached data date can be stale (a
  planner moved it in another tab), and a client that refuses what the server would accept is a dead end.

## Consequences

- `alsoDescribedBy` is retired: its two callers (Codes, WBS members) pass `error` instead, and the hand-rolled
  `scrollIntoView` in the members panel is gone with it. A caller that needs a refusal described by Save puts it in the slot.
- Ten top-of-scope `<p role="alert">` copies are deleted. One `role="alert"` per scope is now the invariant, asserted by
  the callers' tests with `expectRefusalBesideSave` (`components/ui/scope-save-bar-assertions.ts`).
- "Refresh this section" removes itself on activation, so the editor hands focus to the scope's Save, which stays
  mounted; before this, focus fell to `<body>` from the button just pressed.
- While a refusal shows, the bar's own helper sentence is not shown. The members panel's "N will move" count is the one
  that carries information; it returns when the refusal clears (the first tick or Refresh), and the tick state itself is
  never touched.
- A refusal with its own action is a new thing for a primitive to carry; the slot types `action` as a node, not a
  callback, so the caller keeps the focus handling that belongs to its action.
- A change to which keys or focus moves `ScopeSaveBar` claims is reviewed by accessibility-reviewer and
  component-reviewer before release (CLAUDE.md §19.13, ADR-0111 in spirit).

## References

- `apps/web/src/components/ui/scope-save-bar.tsx`, `server-error.tsx`, `alert.tsx`
- `apps/web/e2e-workspace-chrome/progress-refusal.spec.ts` (both tests: the field case at 1024 × 600, and a real version
  conflict whose refusal is in the viewport, inside the dialog's scroll region and beside Save)
- `docs/TECH_DEBT.md` #583 and #584
