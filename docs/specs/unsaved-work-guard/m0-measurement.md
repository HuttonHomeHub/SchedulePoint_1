# M0 — measurements

> Milestone 0 of [`implementation-plan.md`](implementation-plan.md). Ships dark. Every figure is
> quoted beside the command that produced it (CLAUDE.md §19.11).

**Measured 2026-08-23.**

## M0-T4 — the dependency claims are registered (done first, because the rest cites them)

Eight citations into `@tanstack/history@1.162.1` and `@tanstack/react-router@1.170.27` are now in
`scripts/dependency-claims.json`, each anchored on a distinctive string read from the installed
source. `pnpm check:claims` reports **71 claims** green.

**Verified red first**, per the task's own acceptance condition: corrupting one anchor
(`index.js:247-257`) produced `the anchor is no longer at dist/esm/index.js:247-257`, and restoring
it returned to green. A green gate that has never been seen red proves nothing.

Note the standing blind spot: `docs/TECH_DEBT.md` **#181** — a `ref` is `basename:lines` and carries
no version, so these will need re-reading rather than re-confirming on any bump of either package.
**#183** was filed during this milestone: the colon-form scan is case-sensitive lowercase, so
`useBlocker.js:35` is invisible to it in both directions, which is why the citations into that file
use the prose form.

## M0-T2 — the `enableBeforeUnload` trap is real, and it is the one that would ship this broken

Read directly from `@tanstack/history@1.162.1` `dist/esm/index.js:247-257`:

```js
const shouldHaveBeforeUnload = blocker.enableBeforeUnload ?? true;
if (shouldHaveBeforeUnload === true) { shouldBlock = true; break; }
if (typeof shouldHaveBeforeUnload === "function" && shouldHaveBeforeUnload() === true) { shouldBlock = true; break; }
```

**The unload path never calls `blockerFn`.** It reads `enableBeforeUnload`, defaults it to `true`,
and treats `true` as "block". So a blocker registered without that option prompts the browser's
"Leave site?" dialog on **every reload of every page**, including a page with nothing unsaved — and
it would do so while the router-side guard behaved perfectly, which is exactly the shape that looks
correct in every unit test and is obviously broken the first time a person reloads.

The function form is therefore not a refinement, it is the only correct usage. Both agents found
this independently; it was then confirmed here by reading the installed file rather than by
accepting either report.

## M0-T3 — the dirty-surface inventory, and the two ways the script was wrong

`node apps/web/scripts/dirty-surface-inventory.mjs`

```
25 components, 32 RHF instances, 13 dialogs
MIXED candidates (READ THESE — the script cannot tell input from UI state): 5
state-only: 1 — app-shell.tsx
```

**The first version was wrong by a false negative**, in precisely the way the task warned about. It
classified each component by whether it used react-hook-form and stopped, so `CalendarFormDialog` —
which has an RHF form at `:126` **and** the seven-day working week in `useState` at `:155`, outside
RHF on purpose (`:152-156` explains why) — was counted as covered. The dangerous shape is not "no
RHF", it is **both**, and a component in that state reports `isDirty === false` while a planner has
edited every day of the week. That case is the entire reason this task exists, and the first script
hid it.

**The second version was wrong by false positives**, which is worth recording rather than quietly
fixing. It reported five MIXED candidates; reading them reduced the list to **one**:

| Candidate                                               | Verdict                                                |
| ------------------------------------------------------- | ------------------------------------------------------ |
| `CalendarFormDialog` `week` / `weekProblems`            | **REAL** — user-authored hours, invisible to `isDirty` |
| `ActivityCreateDialog` `hiddenProblem`                  | UI state                                               |
| `ResourceFormDialog` `calendarQuery`, `parentQuery`     | combobox search text                                   |
| `NoteItem` `deleteError`, `conflict`                    | error state                                            |
| `ShareLinksDialog` `created`, `revoking`, `revokeError` | result state                                           |

A `useState` seeded around an open dialog looks identical whether it holds work or status, so the
script now reports MIXED as a **candidate list to read** rather than a classification. Claiming
otherwise would be the same overclaim as the first version, pointing the other way.

**What this settles for the scope decision:** the product owner's four surfaces are the right four,
and there is **no broad hidden population** — 32 RHF instances across 25 components, exactly one of
which holds user input outside RHF. The remaining forms are ordinary and can register later with no
redesign.

## M0-T1 — still open

Whether a `beforeLoad` thrown redirect reaches the blocker is **not yet measured**; it needs a
running app and a probe route, and it is scheduled with M1 rather than guessed at. The design is
safe either way because `/sign-in` is on the allow-list, which is why it does not block this
milestone — but it is recorded as open rather than assumed, per ADR-0076 Class 3.
