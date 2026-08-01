# ADR-0067: The window-list editor, and storage honesty in calendar authoring

- **Status:** Proposed
- **Date:** 2026-08-01
- **Deciders:** James Ewbank (with Claude Code)

> **Short by design.** This ADR completes decisions that ADR-0036 already accepted rather than making
> new architectural ones. Two things here are genuinely new: **the shared window-list primitive**, and
> **the storage-honesty rule**. Everything else is ADR-0036 §2 reaching the user at last.

## Context

ADR-0036 was the **gating** rework. It moved the engine and storage to working-minutes and gave
calendars intraday shift patterns — split shifts, midnight-crossing nights, asymmetric weeks, and
window-only base weeks. The engine implements all of it, `calendar_shifts` and
`calendar_exception_windows` hold it, and the ADR-0034 goldens are green on it.

For a year nothing could author one. `api-v0.34.0` (PR #205) closed the API half for the **weekly
pattern**, and the working tree has since closed it for **exception windows** — `windows` on the
create DTO, `exceptionWindowRowsFor` replacing the `isWorking ? [full-day] : []` derivation, and
`endDate` + `windows` on the read DTO. The **planner** still has seven weekday checkboxes.

Shipping the API half alone created new damage, which is what makes this urgent rather than merely
overdue:

1. A calendar carrying real shifts — from an import, or a colleague's API call — can be opened in the
   web form, renamed, and **silently flattened to whole days**, because the form sends
   `workingWeekdays` and the repository replaces the week as a set.
2. `MIN_WORKING_WEEKDAYS_MASK` is now `0` and `shifts: []` is accepted, so a calendar with **no
   working time at all** is creatable. `buildWorkingTimeCalendar` refuses it with a plain `Error`
   that nothing catches, so recalculating a plan on it is an opaque **500** — live, default-on, with
   no flag in front of it. _(Fixed ahead of the rest of the epic — see §5.)_

Three documents also still describe the pre-`api-v0.34.0` world: `docs/TECH_DEBT.md` #78/#79/#80,
`packages/seed-http/src/runner.ts` (which still refuses window-only calendars quoting a `@Min(1)`
that no longer exists), and `apps/seed-cli/src/capabilities/coverage.ts` (which still excepts six
`cal_*` capability keys as unreachable when all six are now reachable). That is the ADR-0058 failure
exactly, one epic later.

## Decision

**We will build the calendar shift editor on per-day time rows, with presets and per-day override on
top — not a drag-and-drop week grid — and we will store what the planner authored, literally.**

### 1. Rows are the substrate, and the substrate was never the choice

A grid still needs numeric entry for precision: a 07:30 start comes from a contract, not from a
pixel. So "a grid" is really **grid plus rows**, while "presets" is **rows plus presets**. Rows are in
every version of this feature; the only question is what sits on top of them, and presets are the
cheaper, more accessible answer.

### 2. One `WindowListEditor`, because windows are edited in two places (the load-bearing reason)

A window is authored **twice**: in the weekly pattern, where it has a weekday, and in a dated
exception, where it has none. A 7-column week grid structurally cannot serve the second. Choosing one
would commit the codebase to **two** window editors that must independently agree about overlap,
ordering and midnight — a disagreement that would be invisible, because each looks right alone and
only a planner who authored the same hours both ways would ever see them differ.

So the primitive is shared: `components/ui/window-list-editor.tsx`, consumed by the weekly editor and
the exception editor. This is ADR-0059's "the time axis is shared, not reimplemented" and ADR-0062's
"extracted, not reimplemented", applied to a form.

It lands **with** its first consumer, never ahead of one — the TECH_DEBT #57 precedent, whose
no-consumer deadline expired unnoticed.

### 3. There is no premise here for a heavy substrate

ADR-0026 chose Canvas 2D because it had a premise: thousands of items at arbitrary 2-D positions with
routed links. ADR-0059 declined canvas for the Gantt the moment virtualization removed that premise.
A working week is **≤ ~14 windows whose values are the information**, not their pixel positions. No
premise, no heavy substrate.

And the empirical argument points the same way: every enablement gate in this repository —
ADR-0060 M6, ADR-0062 M6, ADR-0063 M6, ADR-0064 §7 — found **state** defects (inert controls, native
`disabled`, unannounced changes, dropped fields, errors placed beside a control rather than linked to
it). None found a substrate choice. A hand-rolled drag grid multiplies exactly that defect class
against a WCAG 2.2 AA merge gate, with no APG pattern to follow.

**If a week grid ever earns its place, it is a read-only preview rendered from the same windows** —
never a second editor.

### 4. Storage honesty: what is stored is what was authored, and nothing is reconstructed on read

This is the rule the epic exists to establish, and it has three consequences:

- **A midnight-crossing night shift is two adjacent-day windows.** The editor offers a "crosses
  midnight" affordance that splits 20:00–06:00 into `{weekday: 0, 1200–1440}` and
  `{weekday: 1, 0–360}` and shows **both rows before save**. Nothing pairs them back on read. The
  rejected alternative — infer a crossing when one day ends at 1440 and the next starts at 0 — is
  wrong for a genuine 24-hour calendar, where every adjacent pair has that shape and none of them is
  a night shift.
- **A preset is not persisted.** It writes windows and then has no further existence. A stored preset
  id would disagree with the first hand-edited day, and something would have to decide which is true.
- **An unsorted array is rejected, never quietly sorted.** Already the rule in `AreWindowsOrdered`;
  the client mirrors it rather than helpfully reordering, because reordering hides which pair the
  author got wrong.

The same rule is why `endDate` is exposed on read even though no write path can yet make it differ
from `date`: a field the client cannot see is a field the client cannot be told changed.

### 5. The empty week is selectable, with an advisory — and the advisory must not lead to a 500

A window-only calendar is valid (ADR-0036 §2) and is exactly what a turnaround needs. The form will
allow it, with an inline `role="status"` advisory saying the calendar takes its hours from dated
exceptions. It is an advisory and not a validation error because **the form can only see one half**:
the engine checks the weekly pattern _and_ the exceptions together, and that is strictly stronger
than anything a create form can know.

That honesty is only defensible if the other half answers honestly too. So this epic also maps the
engine's no-working-time condition to a **422 naming the calendar**, at both service seams that build
a calendar port (`ScheduleService.resolveCalendar` and `BaselinesService.resolveCalendar`), replacing
today's opaque 500.

**Landed ahead of the rest of the epic**, because it was live and default-on rather than gated by
anything this ADR proposes. The mapping is one shared `buildPlanCalendarOrReject` in
`plan-calendar.ts`, not a catch at each seam: both reach the state identically, and the copy that
drifted would be the one nobody exercises — the same argument as `shiftRowsFor` /
`exceptionWindowRowsFor` one layer up. Writing it at only the first seam found would have left the
**baseline variance** read still throwing, which is exactly what happened before its own regression
test was added.

### 6. The CPM engine is not modified, and the recalc parity gate is structurally untouched

Traced rather than asserted. `computeSchedule` is not imported by the calendars module or the web
calendar feature. The engine's calendar port is built by `buildPlanCalendar` from persisted rows, and
it has read `shifts` and `exception.windows` **since ADR-0036 M1** — this epic changes neither that
function, nor `buildWorkingTimeCalendar`, nor `computeSchedule`. Absent `shifts`/`windows`,
`shiftRowsFor` and `exceptionWindowRowsFor` produce exactly the rows the mask and `isWorking`
produced before, so an untouched calendar yields byte-identical engine input.

**One qualification, stated rather than buried:** §5's mapping needs to recognise the engine's
condition. It is done by exporting a named `EmptyWorkingTimeCalendarError` from `engine/errors.ts`
and throwing it where a plain `Error` was thrown — no branch, no behaviour, no signature change, and
no string match on a message. That **is** a change inside `engine/`, and this ADR records it as such
rather than letting "the engine is untouched" cover it: the file changed, the scheduling did not.
`engine/errors.ts` already held two named guards (`ScheduleGraphNotADagError`,
`UnknownActivityError`), so this is the existing pattern rather than a new seam. "The engine is
untouched" is a sentence this repository has learnt to check.

### 7. No schema change

Every constraint this feature relies on already exists: bounds and order CHECKs, a GiST EXCLUDE for
non-overlap within a weekday and within an exception, and the two indexes whose comments say "the
engine load IS this index". **Zero migrations.**

### 8. Flagged, default off, flipped last

`VITE_CALENDAR_SHIFT_EDITOR`, `flagDefaultOff`, with flag-off parity suites pinning the seven
checkboxes, the two-option exception form **and both request bodies**. The suites are kept after the
flip, not deleted — they are the rollback contract (ADR-0053 M6). The flip is its own commit after
the five specialist reviews, the flag-on journey, and a seeded catalogue plan.

## Alternatives considered

- **A drag-and-drop week grid.** Direct and visual. Rejected: it cannot serve the exception editor at
  all (§2), so it buys one nice surface at the price of two editors that must agree; it still needs
  numeric entry underneath (§1); and it is a hand-rolled drag interaction with no APG pattern,
  against a WCAG 2.2 AA merge gate, in a repository whose gates keep finding state defects (§3).
- **Preset-only, no free entry.** Simplest and most accessible. Rejected: it cannot express a 07:30
  start, which is what most contracts actually say.
- **A raw JSON/text field for the windows.** Expresses everything. Rejected: teaches nothing, fails
  WCAG 3.3, and moves validation into the planner's head.
- **Infer midnight crossings on read.** Fewer rows on screen. Rejected: indistinguishable from a
  24-hour calendar, and it makes the read disagree with what was stored (§4).
- **Persist a preset id on the calendar.** Would let the library table say "Two shift" cheaply.
  Rejected: it becomes a lie the first time a day is edited, and Q5's derived summary gets the same
  benefit from the windows themselves.
- **Leave the empty week blocked in the form.** Safest-looking. Rejected: it keeps the API's
  supported turnaround shape unauthorable by the only client anyone uses, which is the defect this
  epic exists to close — and the 422 (§5) makes allowing it safe.
- **Defer the 500 fix to the milestone that makes it easy to reach.** Rejected: it is live and
  default-on today; two lines of curl reach it now.

## Consequences

- **Positive.** A planner can describe the working week their programme actually runs on. Six
  ADR-0066 capability keys become reachable and the coverage report starts telling the truth. The
  flatten-on-unrelated-save regression is closed. `docs/TECH_DEBT.md` loses two rows entirely (#78,
  #79) and #80 shrinks to what is left. One primitive serves both window surfaces, so they cannot
  drift.
- **Negative / new debt.** A shared primitive is a standing obligation. Flag-off keeps the flattening
  behaviour, which is the accepted rollback cost and is stated in the flag's docblock. `interchange`
  still flattens shifts on import (`ImportCalendarBatchInput` carries only `workingWeekdays`) — now
  tractable, and recorded as a new debt row rather than fixed here. Multi-day exception **authoring**
  stays deferred; `endDate` on read means nothing is hidden by that. Q2's `HH:MM` text field is a
  hand-rolled control where a native one nearly fits, because `<input type="time">` cannot express
  24:00 — the single most common end value in this domain.
- **Neutral.** ADR-0036 is **completed, not amended**: §2 already specified everything this authors.
  ADR-0024's calendar model, ADR-0053's tiers and archive lifecycle, and ADR-0028's pen model are all
  unchanged — a calendar is org-scoped library data, not plan structure, so it is not pen-gated, as
  it is not today.

## References

- Completes [ADR-0036](0036-hour-granular-calendars-and-durations.md) §2 (the calendar model).
- Spec: [`docs/specs/calendar-shift-editor/`](../specs/calendar-shift-editor/) — §0 records what was
  verified, and where the epic brief was wrong.
- [ADR-0034](0034-engine-conformance-methodology.md) (the recalc parity gate) ·
  [ADR-0024](0024-working-day-calendars.md) · [ADR-0053](0053-calendar-scoping-and-resource-management.md)
  (tiers, archive, the shared-guard precedent) · [ADR-0061](0061-dialog-layout-system.md) (form
  layout) · [ADR-0066](0066-the-seed-catalogue-and-the-engine-as-oracle.md) (why an engine-green
  capability still needs proving at the application) · [ADR-0058](0058-drift-control-and-the-reconciliation-pass.md)
  (verify the claim).
- Substrate precedents: [ADR-0026](0026-tsld-canvas-rendering-and-architecture.md) §16 (a heavy
  substrate needs a premise) · [ADR-0059](0059-gantt-view-rendering-substrate-and-the-view-seam.md)
  (declining canvas once the premise went) · [ADR-0062](0062-activity-editor-convergence-logic-resources-notes-as-tabs.md)
  (extracted, not reimplemented).
- TECH_DEBT #78 / #79 / #80 (the three write-path gaps) and #57 (a primitive without a consumer).
