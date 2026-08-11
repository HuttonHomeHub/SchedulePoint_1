# M2 — which existing suites this milestone invalidates, and how

> **This document is a gate, not a note.** The pre-approval review made it a precondition of M2
> starting: _"Every relocation feature (2.1, 2.2, 2.4, 2.5) must name its affected suites and say,
> per suite, whether the change is a rename or a rewrite — before M2 starts."_
>
> The reason is specific to this milestone. **M1's before/after oracle argument was structural and
> verified**: `computeOverflow` gained two zero-defaulted parameters, so every existing call site
> compiled and behaved byte-identically, and ~25 suites ran untouched as the proof. **M2 has no such
> argument.** It moves commands between surfaces and, in one case, changes a command's interaction
> model. Suites that assert those commands will fail, and a suite that fails is not an oracle — it is
> a decision waiting to be made under time pressure, at the end of the milestone, by whoever is
> looking at red CI. Naming them now is what stops "the existing suites are the oracle" from quietly
> becoming false in the milestone that most needs one (ADR-0084 D5: coverage moves with a **named**
> destination, never quietly).

## Method, and its limit

Every row below was established by **opening the assertion**, not by grepping for a word. A bare
grep for `share`, `print`, `export` or `calendar` matches 100+ files apiece — those words are
everywhere in this repository — so the search was by **accessible name** (`Resource view`,
`Baseline overlay`, `Isolate logic path`, …), and each hit was then read to see what it does with
the control.

**The limit worth stating:** this finds suites that name a command. It cannot find a suite that
reaches one positionally — "the third button in the lens group" — and it cannot find an e2e
assertion that passes for the wrong reason. Neither pattern was found in what was read, but the
method could not have proved their absence.

**One structural fact decides most rows.** The toolbar unit suites render only the two rows:

```tsx
// tsld-toolbar-lenses.test.tsx:36-48 — and the same shape in every sibling
const rows = splitByRow(buildTsldToolbarItems());
render(<><Toolbar items={rows.look} … /><Toolbar items={rows.do} … /></>);
```

So a command moved to the **selection bar** leaves this tree entirely — no query can reach it, and
the suite must be re-homed. A command moved into **`View ▾`** stays in the tree (the popover is a
Row-1 item) but is no longer a top-level button: the suite needs an opening step. That single
distinction, plus `colour-by`'s change of interaction model, accounts for every rewrite below.

---

## Feature 2.1 — `zoom-to-selection`, `isolate-logic`, `float-paths` → the selection bar

| Suite                                                                                                                                         | Assertion                                                                                                                                                                | Verdict                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tsld-toolbar-canvas-nav.test.tsx:59-120`                                                                                                     | 8 assertions on `Isolate logic path` as a **split-button** — arm, toggle-off, chevron menu, ArrowDown keyboard parity, "Stop isolating", and two shade-with-reason cases | **Rewrite** — re-home to a suite that renders the selection bar. The assertions themselves transfer verbatim; only the host changes.                                                                                           |
| `tsld-toolbar-float-paths.test.tsx:59-122`                                                                                                    | `Float paths` open/close/pressed/three shade cases, plus `Isolate logic path` shaded in the Gantt                                                                        | **Rewrite**, same shape. The Gantt case is the one to watch: it asserts a **canvas-only reason survives a view change**, which is the ADR-0059 M6 rule the feature's Risks line calls out. It must not be dropped in the move. |
| `e2e-float-paths/float-paths.spec.ts:55`                                                                                                      | `lookRow.getByRole('button', { name: 'Float paths' })` — **scoped to the Row-1 toolbar**                                                                                 | **Rewrite** — the scope is the breakage. Re-point at the selection bar and add the select-a-bar step the command now requires.                                                                                                 |
| `e2e-search-nav/search-nav.spec.ts:178-181`                                                                                                   | `page.getByRole('button', { name: /^Zoom to selection/ })` — **unscoped**                                                                                                | **Rename-grade at most.** The locator finds the control wherever it lives, so this may pass unchanged; it still needs re-reading, because a journey that passes for a new reason is worse than one that fails.                 |
| `float-paths-flag-off.parity.test.tsx`, `float-paths-view-agnostic.structural.test.ts`, `use-float-paths.test.ts`, `FloatPathsPanel.test.tsx` | the panel, the hook and the flag-off contract — none of them the toolbar registration                                                                                    | **Unaffected.** Verified by reading: they do not query a toolbar control.                                                                                                                                                      |

## Feature 2.2 — `colour-by`, `baseline-overlay`, `resource-view`, `over-allocation`, `legend` → `View ▾`

| Suite                                                                                          | Assertion                                                                                                                                                                       | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tsld-toolbar-lenses.test.tsx:106-142`                                                         | `Colour · Criticality` as a **menu-button** whose name carries the active mode, opening a `menuitemradio` list; `Baseline overlay` as a top-level toggle with three shade cases | **Rewrite — and the deepest one in the milestone.** `colour-by` becomes a radio group _inside_ `View ▾`: a different interaction model, not a relocated button. The assertion that the **trigger's name reflects the active mode** (`:114-117`) has no successor at all — a radio group inside a popover has no trigger to name — so the feature must decide what replaces that affordance before the test is rewritten, not after. |
| `tsld-toolbar-resource-view.test.tsx:47-127`                                                   | 10 assertions on `Resource view` and `Flag over-allocated` as top-level toggles, including four shade-with-reason cases                                                         | **Rewrite** — add the `View ▾` open step; the pressed-state and reason assertions transfer unchanged.                                                                                                                                                                                                                                                                                                                               |
| `plan-workspace-toolbar.test.tsx:286-305`                                                      | clicks `Legend` and `Resource view` **by name at the workspace level** and asserts the canvas responds                                                                          | **Rewrite** (open step). These are the most valuable of the group — they assert the _effect_, not the control — so they must survive rather than be replaced by a "the item is in the menu" assertion.                                                                                                                                                                                                                              |
| `e2e-resource-view/resource-view.spec.ts:65,95`                                                | `lookToolbar.getByRole(…)` — **scoped to Row 1**                                                                                                                                | **Rewrite** — same as the float-paths journey.                                                                                                                                                                                                                                                                                                                                                                                      |
| `tsld-toolbar.test.tsx:292-314`                                                                | asserts `Colour by…`, `Resource view`, `Flag over-allocated` render as **flag-off "Coming soon" placeholders**                                                                  | **Rewrite**, and it needs a decision first: the flag-off placeholder must land somewhere too. Moving the live control into `View ▾` and leaving its placeholder on Row 1 would make the flag-off and flag-on surfaces structurally different, which is exactly what the flag-off parity suites exist to prevent.                                                                                                                    |
| `tsld-toolbar.test.tsx:161-185`                                                                | `Legend` as a top-level show/hide toggle with `aria-pressed`                                                                                                                    | **Rewrite** (open step). Note `legend` moves to a **Panels** section, not Insight overlays — it shows a panel, it is not an overlay on the bars.                                                                                                                                                                                                                                                                                    |
| `toolbar-registry.test.ts:320`                                                                 | mentions `Legend` in a **comment** about demotion order                                                                                                                         | **Unaffected** — prose, not an assertion. Update the comment for accuracy; nothing fails.                                                                                                                                                                                                                                                                                                                                           |
| `TsldLegend*.test.tsx` (9 files), `TsldLegendPanel.test.tsx`, `use-legend-panel-prefs.test.ts` | the legend panel's own rendering and preferences                                                                                                                                | **Unaffected** — none queries the toolbar control.                                                                                                                                                                                                                                                                                                                                                                                  |

## Feature 2.3 — read-outs leave `role="toolbar"`

| Suite                                      | Assertion                                                                                                                                               | Verdict                                                                                                                                                                                                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e-toolbar/toolbar.spec.ts:61`           | `lookRow.getByText('Finish')`                                                                                                                           | **Rename** — re-point at the plan header. This is the one the plan already predicted, and the prediction was right: a change of location, not of capability.                                                                                                                              |
| `plan-workspace-toolbar.test.tsx:249`      | `screen.getByText('Finish')` — **unscoped**                                                                                                             | **Unaffected by the move**, and that is precisely why it needs re-reading: it will keep passing from the header, so it stops testing what its name implies. Scope it to the header explicitly rather than leaving a passing assertion that no longer means anything.                      |
| `Toolbar.test.tsx` (`finish-chip`)         | uses the id as a **fixture** for a `presentational` item                                                                                                | **Unaffected** — it is a stand-in for the capability, not for the plan's Finish read-out. Keep it: M2-T3 records that `presentational` has no remaining consumer on this surface and deliberately **does not remove the capability**, so its test must survive the last consumer leaving. |
| `tsld-toolbar-canvas-nav.test.tsx:122-158` | the `Conflict i of n · reason` status chip: rendered while cycling, truncated inline with the full list in `title`, hidden when nothing is being cycled | **Rewrite** — the chip folds into `Next conflict`'s own label. All three assertions have successors; the truncation one is the subtle case, because a label has different width behaviour from a chip.                                                                                    |

## Feature 2.4 — `history` → `output`, and the `Share & export ▾` split-button

| Suite                                                                                                                                        | Assertion                                              | Verdict                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tsld-toolbar.test.tsx:292`                                                                                                                  | `Export…`, `Print…`, `Share…` as flag-off placeholders | **Rewrite** — they move behind one trigger.                                                                                                                                                                                                  |
| `tsld-toolbar-export.test.tsx`, `tsld-toolbar-interchange-export.test.tsx`, `tsld-toolbar-share.test.tsx`, `tsld-toolbar-share-off.test.tsx` | the export menu's contents and the share dialog        | **Rewrite of the entry step only** — the menus themselves are unchanged, so every content assertion transfers.                                                                                                                               |
| `e2e-share/share.spec.ts`, `e2e-interchange/interchange.spec.ts`, `e2e-csp/csp.spec.ts`                                                      | reach Export/Share through the Row-2 controls          | **Rewrite of the entry step.** `e2e-csp` is the one to be careful with: it is a **security gate** (ADR-0074), and it exports in order to exercise the CSP, so it must keep exporting rather than be trimmed to the parts that still compile. |
| `use-tsld-toolbar-context.export-*.test.tsx` (3 files)                                                                                       | the context callbacks                                  | **Unaffected** — they call the context directly and never render a toolbar.                                                                                                                                                                  |

## Feature 2.5 — `baselines`, `calendar`, `earned-value`, `resource-histogram` → `Plan ▾`

| Suite                                                                                                                   | Assertion                  | Verdict                        |
| ----------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------ |
| `e2e/baselines.spec.ts`, `e2e-toolbar/toolbar.spec.ts`                                                                  | reach Baselines from Row 2 | **Rewrite of the entry step.** |
| `BaselinesPanel.test.tsx`, `CreateBaselineDialog.test.tsx`, `ResourceHistogram.test.tsx`, `EarnedValuePanel.*.test.tsx` | the panels themselves      | **Unaffected.**                |

## The one command with no relocation, and what its suite means for M2-T0

`shortcuts` stays on Row 1 in Option B. `TsldPanel.a11y.test.tsx:188` clicks it by name and is
unaffected either way — **including** if M2-T0's recommendation to relocate it is taken, since that
assertion is unscoped. So the suite does not constrain the decision, which is worth knowing before
the decision is put to the product owner: nothing in the test estate argues for keeping it.

## Totals

|                                                          |   count |
| -------------------------------------------------------- | ------: |
| Rewrites                                                 |  **14** |
| Renames                                                  |   **1** |
| Unaffected but must be re-read (passes for a new reason) |   **2** |
| Unaffected, verified                                     | **~18** |

**Fourteen rewrites is the finding.** The plan's Feature 2.3 offered one rename and called the
milestone's test impact "a rename of location, not of capability". That is true of exactly one
assertion out of fifteen.

---

## Decision — what replaces `Colour · Criticality` (M2-T2, taken 2026-08-11)

The table above raises this as a blocker: `colour-by` becomes a radio group inside `View ▾`, and a
radio group in a popover **has no trigger to name the active mode**, so
`tsld-toolbar-lenses.test.tsx:114-117` — which asserts the trigger reads `Colour · WBS group` — has
no successor. That assertion is not fussy. Colour is the diagram's dominant encoding: a planner who
has coloured by WBS group and forgotten reads every criticality judgement wrong, and the control
that would have told them is the one being moved.

**Decision: annotate the `View ▾` trigger, but only when the mode is not the default.**
`View` at `criticality` (the default, `use-tsld-canvas-ui-state.ts:149`); `View · WBS group` and
`View · Total float` otherwise.

Why this rather than the alternatives:

- **Not "accept the loss".** The lost information is a _mode_, and a mode with no indicator is the
  defect class this epic keeps finding — a control that looks one way and behaves another.
- **Not a canvas-corner read-out.** It is a new persistent surface on a canvas that already carries
  the ADR-0054 cursor chip, the ADR-0056 Today pill, the ADR-0063 band and the ADR-0064 mode
  statement. Adding a fifth to preserve a label is how the canvas gets taken away a strip at a time.
- **Not "the legend already says".** It does, and only while the legend panel is open — which is a
  toggle, and which M2-T2 is _also_ moving into `View ▾`. Two hidden things do not make one visible.
- **Not keeping it on Row 1 shrunk.** It is a `render` item, so its width is paid at every viewport;
  183 px is the single largest remaining pinned cost, and removing it is most of what M2-T2 buys.

**Non-default-only is the load-bearing half.** Annotating always would put a permanent ~90 px on a
trigger to say the thing that is already true, on the surface whose whole problem is width. Showing
it only when the diagram is coloured unusually spends width exactly when the information is worth
having, and costs nothing in the state most planners are in most of the time.

The test rewrite follows: the assertion moves from "the Colour trigger names the mode" to "the View
trigger names a **non-default** mode and does **not** name the default one" — a stronger claim than
the one it replaces, because it pins both halves.
