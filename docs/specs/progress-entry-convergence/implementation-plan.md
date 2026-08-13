# Implementation Plan: Progress-entry convergence

- **Spec:** [`feature-spec.md`](./feature-spec.md)
- **Status:** Draft — awaiting product-owner approval (Q1 in the spec is blocking for M2 only)
- **Date:** 2026-08-13
- **Proposes:** ADR-0093

---

## Breakdown

### Epic

**One activity action, one place.** Remove the command surface's `Report progress` item, keep the
object's, and write down the discriminator that decides where the next one goes.

Frontend-only. **The CPM engine is not imported and no migration runs**, so the ADR-0034
recalculation parity gate is untouched by construction, and the `database-architect` agent is not
engaged because there is no schema to design — not because the change was judged too small
(§19.3).

---

### Milestone M0 — Establish (measure before deciding) · _dark, no user-facing change_

The epic's own premise is that a document was trusted instead of checked, so M0 checks the three
claims the later milestones rest on. **None of the three can change the recommendation** — the
duplication argument stands alone — but each changes what gets written down.

#### Feature: evidence

##### Task M0-T1 — Confirm or refute the plural-selection finding (≈ small)

- **Do:** drive it in a browser. Select ≥ 2 activities on the canvas, read Row 2's
  `Report progress`, record whether it is enabled and, if activated, which activity's dialog opens.
- **Why a browser:** the finding is a code-path derivation across four files
  (`TsldPanel.tsx:563` → `:1538` → `use-plan-workspace-model.ts:312` →
  `tsld-toolbar-items.tsx:2573`) and the repo's own record says a derivation of exactly this shape
  is where defects hide — component tests mount the toolbar in isolation and never run the wiring.
- **Where:** `apps/web/e2e-workspace-chrome/` already runs at 1646 with the pen enforced and no
  `VITE_` pins, which is the right harness.
- **Output:** one paragraph in `m0-measurements.md`, and — if confirmed — a regression assertion
  that goes red against today's code, so M1 can be shown to close it.
- **If refuted:** withdraw the finding **in place** in the spec (struck, with the measurement),
  never delete it. Two prior epics record their own claims being wrong; the record is the value.
- **Tests:** the new assertion, verified red first.
- **Risk:** low. Worst case the finding evaporates and M1 shrinks by one bullet.

##### Task M0-T2 — Measure Row 2 at 1646, before and after (≈ small)

- **Do:** run `apps/web/scripts/measure-toolbar` (or the harness `e2e-toolbar-fit` uses) at 1646
  and record Row 2's item count, its labelled count, and the trailing slack. Then re-run against a
  local branch with the item removed.
- **Why:** so this epic does **not** repeat the claim it would be most natural to make.
  ADR-0092 M4 records folding a row into a band gaining _"exactly nothing"_, and ADR-0091 D4 was
  withdrawn entirely on a measurement that contradicted its plan. The item is 32 px icon-only /
  163 px labelled (`docs/specs/workspace-layout/m2-item-widths.md:308`), but whether removing one
  rung converts into a **label** is a property of the ladder, not of the width.
- **Output:** `m0-measurements.md`. If the answer is "no label gained", say so in those words and
  drop the width argument from the ADR — the duplication argument does not need it.
- **Tests:** none (measurement).
- **Risk:** low.

##### Task M0-T3 — Verify the route census end to end (≈ small)

- **Do:** confirm each of the spec's four routes in both views, including the one the change leans
  on — that the activities-table row menu reaches progress **in the Gantt view**, with the panel
  expanded from collapsed.
- **Why:** it is the sole mitigation for removing route 1, and it is currently established by
  reading which JSX branch the panel sits in. If it turns out the panel is view-conditional after
  all, Q1 stops being a question and becomes a blocker.
- **Tests:** one journey assertion in `e2e-gantt/`.
- **Risk:** low, high value — this is the task that could stop the epic.

---

### Milestone M1 — Remove the item · _user-facing; names its entry point_

Per ADR-0081 a milestone claiming user-facing capability names its entry point. This one **removes**
one, so it names the entry points that remain: the canvas dock (route 2), the activities-table row
menu (route 3) and the activity editor's Progress tab (route 4), each verified in M0-T3.

#### Feature: the removal

##### Task M1-T1 — Delete `update-progress` from the registry (≈ one PR)

- **Files:** `tsld-toolbar-items.tsx` (the shape + both the wired and `placeholderItem` branches),
  `use-tsld-toolbar-context.tsx:521` and `tsld-toolbar-context.ts:248` (`openProgress`, **only if**
  it has no other consumer — check, do not assume).
- **Leave alone, deliberately:** `use-plan-workspace-model.ts:2003` is the **dock's** opener and a
  separate seam; `config/env.ts` keeps `VITE_TOOLBAR_QUICK_WINS`, which still gates `add-note` and
  `comments`; `activity-editor-intent.ts` is the shared intent.
- **Tests:** update `ellipsis-convention.structural.test.ts:65`
  (`['calendar', 'update-progress']` → `['calendar']`) and drop the item's cases from the three
  `tsld-toolbar-quick-wins*.test.tsx` files **without weakening what else those files assert** —
  ADR-0084 D5's rule, and the one this repo has recorded getting wrong by claiming a migrated case
  was "already covered" when it was not. Spot-check each deletion against what remains.
- **Risk:** low. The compiler carries most of it.

##### Task M1-T2 — Pin the rule structurally (≈ small)

- **Do:** add a test asserting that no registry item both consults the selection and duplicates a
  dock item's id or label.
- **Why:** the spec's rule is worth nothing as prose. Every comparable rule in this repo that
  survived is a gate (ADR-0058), and every one that was a habit was found by hand three times
  first.
- **Care:** derive both lists from the two registries rather than restating them — a hard-coded
  list is the ADR-0073 C4 cap defect (a literal that falls behind the vocabulary it describes).
- **Tests:** verified red against a temporarily re-added item.
- **Risk:** low.

##### Task M1-T3 — Docs in lock-step (≈ small)

- `docs/TOOLBAR_ROADMAP.md:50` — the `update-progress` row becomes a record of where the action
  lives, not a wired-item row.
- `docs/specs/workspace-layout/design.md:451` — annotate rather than edit: the reason was right
  and has been satisfied by a surface that did not exist when it was written.
- Changeset (`patch`, `@repo/web`) — user-visible removal.
- **Risk:** low.

---

### Milestone M2 — Gate pass and journey · _blocking on Q1_

#### Feature: the gates that have earned their place

##### Task M2-T1 — Specialist reviews over the combined diff (≈ small)

- **ux-reviewer** and **accessibility-reviewer** at minimum; **component-reviewer** if M1-T2 touches
  a shared primitive.
- **Why both:** the last five enablement passes in this register each found blocking defects in
  code that had already passed a human read, and the recurring shape is _one correct pattern
  applied to a control and not its neighbour_ — which is precisely what a removal creates.
- **Specific thing to point them at:** whether removing the item leaves any surface where a
  Contributor sees only shaded controls. That is the failure the original Row 2 placement existed
  to prevent, and it is the one this change could reintroduce.

##### Task M2-T2 — Journey (≈ one PR)

- **Where:** extend `apps/web/e2e-workspace-chrome/`, which already runs at 1646 with the pen
  enforced against a real API. No new config, no new CI step.
- **Assert:** (a) the dock offers `Report progress` for a single selection and opens the dialog;
  (b) Row 2 does not offer it; (c) with ≥ 2 selected, no surface offers it (M0-T1's assertion, now
  green); (d) route 3 still works in the Gantt (M0-T3, kept).
- **Locate controls by `[data-toolbar-item]`, not by copy** — the standing rule from ADR-0091's
  retrospective, where three journeys broke on label changes.

##### Task M2-T3 — Q1 mitigation, **if the product owner asks for one** (≈ TBD)

Held open deliberately. Do not pick a mitigation before the answer: the options (expand the
activities panel by default in Gantt / add a Gantt row menu / accept the cost) differ enough that
guessing wastes the work. **Everything in M0 and M1 proceeds regardless** — Q1 blocks this task
only, not the milestone before it.

---

### Milestone M3 — ADR-0093 · _decision only_

##### Task M3-T1 — File the ADR (≈ small)

- **Subject:** the discriminator, not the button. An action whose subject is the selected object
  belongs on the object's surface; the command surface carries plan-level and view-level actions.
- **Record, in the register's own style:** the option table including the two rejections and _why_
  the Gantt asymmetry inverted on reading ADR-0059 §4; whether M0-T1 confirmed or refuted the
  plural finding; whether M0-T2's measurement supported the width argument or removed it; and Q2 —
  `add-note` and `clear-visual-placement` are also reachable from a Gantt selection, which is a
  hole in ADR-0059 §4's read-only claim that this epic **names and does not close**.
- **Then:** `docs/adr/README.md` and the CLAUDE.md §16 register in the same commit — the ADR-0071
  failure (a decision cited by shipped code and absent from the index) and its ADR-0078 repeat.
- **Gate:** `pnpm check:adr-coverage` will require a `docs/ROADMAP.md` citation or a written
  exemption. This is a product-surface decision, so it earns a roadmap line rather than an
  exemption.

---

## Sequencing & slices

```
M0 (dark, measure) ──► M1 (remove, ships alone) ──► M2 (gates + journey) ──► M3 (ADR)
                                                      └── M2-T3 blocked on Q1 only
```

M1 is shippable alone and is the whole user-visible change. M0 must precede it because two of M1's
sentences depend on M0's answers. M3 lands last so the ADR records what happened rather than what
was planned — the failure ADR-0084 D4 records, where a decision drafted backwards failed its own
gate on first run.

## Definition of Done (per task)

Per §21: code, tests, docs, the relevant reviews, CI green, changeset, version impact assessed. For
this epic specifically:

- The pre-push gate is **run**, not assumed: `pnpm lint && pnpm typecheck && pnpm test`, plus
  `scripts/e2e-local.sh web:workspace-chrome` for M2-T2. No `apps/api` change, so the API e2e half
  does not apply.
- **After M1's label/layout change, run every journey, not only the suite CI names.** ADR-0091's
  retrospective records three journeys breaking across one such change and each being found by CI
  rather than locally, because the fix was scoped to whichever suite failed first.
- Every claim that decides something names what established it (§19.10).

## Risks & assumptions (rollup)

| Risk                                                                | Likelihood  | Impact | Mitigation                                                                                                        |
| ------------------------------------------------------------------- | ----------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| A Contributor working in the Gantt loses their quickest route       | **certain** | medium | Q1 — the product owner's call, with M2-T3 held open for it                                                        |
| The width argument turns out to buy nothing                         | medium      | none   | M0-T2 measures it; the ADR drops the argument rather than keeping a claim that did not hold                       |
| The plural finding is a mis-read of the wiring                      | medium      | none   | M0-T1 confirms in a browser; withdrawn in place if refuted                                                        |
| A quick-wins test file is weakened while its cases are pruned       | medium      | medium | M1-T1 spot-checks each deletion — the ADR-0084 D5 rule, previously broken by claiming coverage that did not exist |
| Removing the item strands a persona on a surface of shaded controls | low         | high   | M2-T1 points the UX gate at exactly this                                                                          |

**Assumption to check, not to trust:** that `openProgress` has no consumer besides the removed
item. M1-T1 checks it.
