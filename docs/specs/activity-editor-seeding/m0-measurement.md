# M0 measurement record — activity editor seeding (#420, F1–F4)

Recorded 2026-10-01 against `afaa017` (`docs(docs): record ADR-0168, levelling follows the links, and
close #427`), on branch `aes-m0`, before any behaviour change. This milestone changes tests and this
document only.

## Verdict: the stop gate fires

**The window probe is red on two of the four hosts, not four** (plan T0.4: "if T0.2 is not red the spec
returns to the product owner"). F1–F4 all reproduce.

| Host                                  | Window probe                  | Pinned as                            |
| ------------------------------------- | ----------------------------- | ------------------------------------ |
| Editor (Name)                         | **red**                       | `it.fails`                           |
| New activity (Name)                   | **red**                       | `it.fails`                           |
| Progress tab click (Percent complete) | **not red** — typed text kept | plain `it` (green, recorded as such) |
| Resources tab click (Budgeted units)  | **not red** — typed text kept | plain `it` (green, recorded as such) |

| Finding                               | Reproduces? | Pinned as                     |
| ------------------------------------- | ----------- | ----------------------------- |
| F1 confirmation armed across Discard  | **yes**     | `it.fails` + J2 `test.fail()` |
| F2 "Saved." survives reopen           | **yes**     | `it.fails`                    |
| F3 hidden-field alert survives reopen | **yes**     | `it.fails`                    |
| F4 Progress draft lost on tab switch  | **yes**     | `it.fails` + J4 `test.fail()` |

The product owner decides whether the epic continues as specified. What this record bears on is the
spec's §0.2 rows **1c** (Progress and measure panels, "same window on tab reveal") and **3** (Resources),
whose "Window reachable?" column is not supported by the probe, and CQ-3 (a)'s framing of M1 as a fix.

## T0.1 — the original site, read (D-7)

`git show 36c1172^:` (the parent of #740's commit) for the three dialogs #740 converted. Each had one
effect and one `useForm`:

| Dialog                  | Effect (lines)                                                                    | Dependencies          | What else could re-fire it                                   |
| ----------------------- | --------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------ |
| `ProjectFormDialog.tsx` | `if (open) { reset({ name, description }); mutation.reset(); }` (51-57)           | `[open, project?.id]` | A change of the edited project's id — only `open` and the id |
| `ClientFormDialog.tsx`  | `if (open) { reset({ name, description }); mutation.reset(); }` (51-57)           | `[open, client?.id]`  | A change of the edited client's id — only `open` and the id  |
| `PlanFormDialog.tsx`    | `if (open) { reset({ … }); mutation.reset(); }` (56-67), same suppression comment | `[open, plan?.id]`    | A change of the edited plan's id — only `open` and the id    |

Nothing besides `open` and the subject's id re-fires any of them: not a refetch of the row (the
dependency is the id, not the object), not a sibling save. They are the same shape as
`useScopeForm`'s effect (`[open, activity?.id]`), which is what the spec asserted. This reading does
not say whether the csp flake the #420 trace came from was the window; that stays a hypothesis.

## T0.2 — the window probe

`apps/web/src/features/activities/components/ActivityEditor.typed-input-window.test.tsx`, helpers in
`apps/web/src/test/typed-input-window.ts`. Vitest + jsdom, `createRoot`, `IS_REACT_ACT_ENVIRONMENT`
off, the opening inside `flushSync`, a native `input` event through the prototype value setter before
yielding, one macrotask, assert the DOM value. Each case ran three times (and the whole file three
more, at the end) with identical results.

Each host also has a **positive control** — the same keystroke one task late — and all four pass.

### What was observed

- **Editor and New activity: red.** Typed `Typed at once`; after one task the editor's Name reads
  `Pour slab` (the seed) and New activity's reads `` (empty). The failing assertion is the final value
  check, not a null field (checked by running the cases as plain `it`). The editor's General tab
  carries no "unsaved changes" marker afterwards: the form never saw the keystroke.
- **Click-driven corroboration, also red.** The same two hosts opened by a click on a button whose
  handler sets state, then `await Promise.resolve()` (the microtask checkpoint that flushes the click's
  sync-lane commit and its passive effects) before typing: editor reverts to `Pour slab`, New activity
  to empty. So the red is not an artefact of rendering through `flushSync(root.render)`.
- **Progress and Resources tab reveal: not red.** A panel mounted by a click shows
  `percent complete = 10` before typing and `55` after; the Progress tab carries "unsaved changes"
  afterwards, so react-hook-form registered the keystroke. The Resources assign form holds `12`.
  Both were tried with the click inside `flushSync` and with a microtask yield.

### Why — a minimal reproduction

A bare component (`useForm` plus `useEffect(() => reset(values), [])`, mounted by a button click) logs
`render, effect, render, typing`: **the effect's re-render completes in the click's own microtask
flush, before any later task can type**, and `getValues()` then holds the typed text. Mounted instead
by an `open` flip inside `flushSync(root.render)`, or by a click that flips `open` on an
already-mounted component, the re-render is a task away and the keystroke is lost. So the window is a
property of **an already-mounted form whose `open` flips**, which is exactly the editor and New
activity, and it is absent for a form **mounted by** the click, which is exactly the two panels.

(An earlier draft of the probe asserted only the DOM value for a bare component and appeared to pass
on a lost keystroke, because nothing re-rendered to overwrite the DOM. The editor and panel cases
assert the DOM after a task and, for Progress, the dirty marker; a lost keystroke is visible in both.)

### What this does not establish

Whether a real browser's driver ever lands a keystroke inside the window. This probe types before
**any other task runs**; a Playwright `fill` arrives over the protocol several milliseconds later, by
which time the default-priority re-render has almost certainly run. #420's own csp trace remains
unobserved. The jsdom probe shows the window **exists** for the two hosts; only a browser measurement
can say whether it is **reachable**. The orchestrator can take that measurement; this milestone does
not (no Playwright).

### Consequences if the spec proceeds as written

- M1 (delete the Resources reset) changes no behaviour the probe can see: the Resources host is not
  red, so its probe has nothing to turn green. CQ-3 (a) is still correct as a deletion of a redundant
  effect (spec §0.2 row 3 already said "redundant"); it is a cleanup, not a fix.
- M4's per-panel work fixes **F4** (a draft lost on a tab switch), which does reproduce, and not a
  window on tab reveal, which does not.
- M2 and M3b's per-opening construction fixes a window that exists in jsdom for exactly their two
  hosts.

## T0.3 — F1–F4

`apps/web/src/features/activities/components/ActivityEditor.reopen-state.test.tsx`. A host that toggles
`open` and clears its intent on close, as `activity-crud-dialogs.tsx` does. Each case carries a
control inside the same test (the state is real in the opening that made it) and asserts the reopened
state; all four were run as plain `it` and failed at the intended assertion.

| Finding | Failing assertion today                                                                                                                                                                                                                         |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1      | After Discard and reopen of the same activity an `alertdialog` is present: "Discard unsaved changes? Switching to Pour slab will discard them." — the subject guard's `'subject'` confirmation, armed while closed                              |
| F2      | After Save general, Close, reopen: `Saved.` is still printed                                                                                                                                                                                    |
| F3      | After a hidden-field submit failure, Cancel, Discard, reopen: the "field holding it is one this activity type hides" alert is still shown (`RESOURCE_LEVELLING_ENABLED` mocked on; negative levelling priority, then a milestone type hides it) |
| F4      | `Percent complete` is `10` after General then Progress, not the `55` typed; the Progress tab carried the dot while away                                                                                                                         |

jsdom has no top layer, so F1 asserts that a confirmation is **armed**; that it opens beneath the
editor is J2's question.

### Journeys J2 and J4 — written, not run

`apps/web/e2e-activity-editor/activity-editor.spec.ts`, each `test.fail()`. **Not run by the author**
(shared database and ports). Run with `scripts/e2e-local.sh web:activity-editor`. Expected: both
suites' new tests report as **expected failures** (the suite is green); the rest of the file is
unchanged and passes. If J2 or J4 reports "expected to fail but passed", that finding does not
reproduce in a browser and its unit test should be re-read. J2 attaches a screenshot of the reopened
editor as `j2-reopened-editor` — the evidence of the stacking.

**Run afterwards (2026-10-01), by the orchestrator, not by this record's author:**
`scripts/e2e-local.sh web:activity-editor` in the M0 worktree reported **13 passed, with J2 and J4 as
expected failures** — so F1 and F4 reproduce in real Chromium as well as in units. The product owner then
chose to continue the epic with the plan corrected to this record (spec §0.4).

## Where the red tests flip

| Test                                        | Marker                    | Flips in            |
| ------------------------------------------- | ------------------------- | ------------------- |
| window — editor (flushSync and click)       | `it.fails`                | M3b                 |
| window — New activity (flushSync and click) | `it.fails`                | M2                  |
| window — Progress, Resources                | plain `it`                | n/a — already green |
| F1, J2                                      | `it.fails`, `test.fail()` | M3a                 |
| F2                                          | `it.fails`                | M3b                 |
| F3                                          | `it.fails`                | M2                  |
| F4, J4                                      | `it.fails`, `test.fail()` | M4                  |
