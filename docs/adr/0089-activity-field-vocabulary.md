# ADR-0089: One activity field vocabulary, and what a field group is

- **Status:** Accepted
- **Date:** 2026-08-11
- **Deciders:** Product owner (epic approval), Claude Code (author)

## Context

An activity has roughly twenty definition fields. Two components rendered them, and
they shared **no code**: `ActivityFormDialog` (the **New activity** dialog, which also
served editing) and `ActivityEditorDialog` (the tabbed editor, ADR-0060). Nine
features — sub-day durations, duration types, calendars, constraints, levelling,
external dates, cost, earned value, WBS — had each added a field to both, by hand,
twice.

The register (`docs/TECH_DEBT.md` #122) blamed the alternative-surface flag
`VITE_ACTIVITY_EDITOR_TABS` for the cost, and was **wrong about that** in a way worth
recording: `ActivityEditorDialog.tsx` said in its own docblock _"This editor is
edit-only; creation stays with `ActivityFormDialog`"_, and `CreateActivityButton.tsx`
rendered the legacy dialog with no flag reference anywhere in the file. Retiring the
flag alone would have deleted three mount sites and left the monolith alive as the
**create** surface, carrying every field those nine features added. The receipts
belonged to create and edit being two components, which is an ADR-0060 decision, not
to the flag.

**The divergence set was re-derived from code rather than trusted**, and that is the
finding this ADR rests on. The spec listed nine; a reviewer found a tenth incidentally;
the characterisation suite written before anything moved found **~26 measurable
differences at row granularity**. Six were defects a planner could hit, not cosmetic
drift:

| #   | What a planner saw                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D2  | An activity nested under a summary the picker could not resolve rendered as **top level** — while the save re-sent the real parent. The screen and the record disagreed. |
| D3  | A `MANDATORY_*` constraint rendered as **no constraint at all**, with its date sitting filled in below it.                                                               |
| D4  | The option keeping the Type selector honest was a **one-way door**: selecting anything else removed it, with no way back.                                                |
| D5  | The editor removed the duration field for level-of-effort, WBS-summary and resource-dependent types and **said nothing**.                                                |
| D1  | A resource-dependent activity's calendar was `disabled` on create, taking the binding out of reach of focus and copy.                                                    |
| D9  | Cost fields were withheld from every duration-derived type, so a **payment milestone** could not be given its value on the only surface that creates one.                |

## Decision

**We will make an activity's fields exist once, as scope-aligned group components that
both hosts render**, and delete the monolith.

Eleven groups live in `apps/web/src/features/activities/components/fields/`. The
decisions that make them a vocabulary rather than eleven extractions:

### D1 — A field is rendered by exactly one component

Groups partition the scope shapes, which partition the field set.
`fields/field-group-partition.structural.test.ts` is the gate: it imports the four Zod
scope shapes, reads their keys, and asserts every key has exactly one owning group.
The shapes are the authority rather than a list restated in the test, so a field added
to a scope without a home fails on the same commit.

It catches the two failures a per-group suite structurally cannot see, because each of
those mounts one group: a field claimed **twice** (both suites pass; a planner edits it
in one section and confuses themselves with the other), and a field claimed by
**nobody** — the silent-drop failure this epic exists to remove, relocated one layer up.

### D2 — A group takes exactly one concrete `UseFormReturn`, and the compiler is the enforcement

A group over `ActivityGeneralValues` cannot `register('constraintType')`: RHF's generics
are invariant and `FieldPath<ActivityGeneralValues>` has no such member. **That is the
only gate here that cannot be talked around.**

Three weaker instruments sit on top, **each recorded with its blind spot**:

1. An ordered `FIELDS ... as const satisfies readonly (keyof TScopeValues)[]` — catches a
   misspelling, and **nothing else**. A name declared and never rendered would compile.
2. Each group's `it.each` over that tuple, asserting a rendered control per name **and
   that tuple order is render order** — this is what closes the hole gate 1 opens, and
   what makes the tuple a specification rather than a declaration.
3. A shared `GroupProps<T>`, which is **not a hard gate**: `GroupProps<T> & { other:
UseFormReturn<U> }` still compiles. It makes the one-form shape the default and a
   deviation visible in a props declaration at review time.

**Two earlier drafts of this decision overclaimed their mechanism and both are kept.**
The first said the `FieldGateProvider` forced it — false: `activity-editor-gating.ts`
returns one shared `definition` object for seven scopes, so it can distinguish nothing,
and a `general`+`cost` group would have been a **disclosure path** for a role with
`gating.cost.readable === false`. The second said `FIELDS` closed the gap when it
checked only spelling. The pattern is the point: **a mechanism is stated with its blind
spot, or it will be overclaimed again.**

### D2b — A cross-scope fact is resolved by the host and passed down as a plain prop

`hoursPerDay` comes from the **scheduling** scope's live calendar selection and feeds
the **general** scope's duration field (ADR-0070 §3). `savedType` anchors the Type
selector's option list. `externalDriven` is the engine's verdict. Each arrives as a
prop. This is the rule, not an exception — it is what stops the next such fact being
solved with a second form prop, which is D2's only erosion path.

### D3 — The save model belongs to the host; ADR-0060 §3 is affirmed and scoped

Per-scope save is a statement about **permissions**. **Creation is one act with one
permission, so it is one scope by construction** — a single submit over four scope
forms, which is not a merged save because there is nothing to merge. `ActivityCreateDialog`
therefore carries no `FieldGateProvider` at all, and the editor carries one per tab.

### D4 — Neither host absorbs the other

Five editor tabs require an activity id. A create dialog cannot host them, and an
editor cannot create. What is shared is the fields, not the surface.

### D5 — A group owns its `FormSection`

A section heading describes a group of fields, so the group that renders those fields
is the only thing that can keep the two in step. **Accepted consequence, listed rather
than discovered in a diff:** create is re-sectioned, because its single "Cost & earned
value" section spanned two write scopes.

**`ActivityMeasureFields` is the one exception, and it is principled.** Its two hosts
frame it differently and both are right — the editor renders it inside a progress panel
whose heading names an effect, create inside an ordinary form section. The two controls
are what is shared; the frame is the host's.

### D6 — The create submit validates with focus suppressed and makes one ordered focus decision

Four forms each focusing their own first problem is four competing focus calls whose
winner is whichever promise settles last. So focus is suppressed **at the form**
(`shouldFocusError: false`) and the host walks a declared `SUBMIT_FIELD_ORDER`.

The order is **declared, not derived**, and neither available derivation is right: scope
order is not what the planner sees, and the DOM cannot be walked at all, because a field
hidden by an off flag or by the current activity type is absent from it while still able
to carry an error.

**Validation goes through each scope's own `handleSubmit`, not `trigger`, and that is a
behaviour fix rather than a style choice.** `trigger()` writes the errors but never sets
`isSubmitted`, and `isSubmitted` is exactly what turns `reValidateMode: 'onChange'` on —
so a `trigger()`-validated submit leaves a corrected field showing its old error until
the planner submits again. This was introduced by M1 and caught before it shipped.

## Alternatives considered

- **Retire the flag first and stop there.** What the register proposed. Rejected on the
  evidence above: it collects none of the payoff. The flag retired at M5 instead —
  **after** the divergences closed — and that ordering made M6 small, because by then
  the monolith's edit half had no renderer left and was dead code rather than a path to
  migrate.
- **One dialog with an `isEdit` mode.** A second product inside one file, which is the
  shape ADR-0088 D2 exists to bound.
- **The editor absorbs creation.** Rejected — D4.
- **A structural test asserting one `UseFormReturn` per module.** Proposed in an earlier
  draft and **withdrawn**: a Vitest structural test cannot read a TypeScript type, so it
  would be a regex over source with real false negatives (props declared in a sibling
  file, a `UseFormReturn<A> | UseFormReturn<B>` union). Replaced by `GroupProps<T>`,
  explicitly recorded as not a hard gate.
- **Keep the divergence characterisation suite.** It mounted both hosts on one stored
  row; with no create-mode host left, its premise is gone. Deleted, with what it was and
  what it proved recorded in the partition gate's docblock.

## Consequences

**Easier.** A field is added, labelled, hinted or gated in one place. The two surfaces a
planner meets one activity through cannot drift, because there is nothing to keep in
step. Eleven group suites test a control against its own scope form, without a dialog.

**Harder.** A change to one group changes both surfaces at once — which is the point,
and is also why the partition gate and the per-group render loops exist rather than
trust.

**Untouched.** The CPM engine is not imported and no migration runs, so the ADR-0034
recalculation parity gate is untouched by construction — in its honest form: there is
nothing here to hold parity for. The API changed not at all; one Supertest case was
**added** to establish that a `FINISH_MILESTONE` accepts an expense, which D9 turns on.

**`VITE_ACTIVITY_EDITOR_TABS` is retired**; `classACap` ratchets 2 → 1. Half of
TECH_DEBT #122 closes. Its two flag-off Playwright harnesses were **converted to the
shipping surface before the flag went** — the ADR-0084 batch-1 lesson applied in
advance rather than re-learnt.

### What this epic got wrong, and how it found out

Five decision-bearing claims failed once executed. All five are recorded here because
the pattern matters more than any one of them: **every single one was a document being
trusted instead of checked** (ADR-0058, ADR-0076 §19.10).

1. **D4's verdict was backwards.** The spec table said "create wins" and the plan said
   to converge the editor onto create's live-watched value. The characterisation case
   written to pin D4 — in the same repository, before the plan was written — calls
   create's behaviour a **one-way door** in its own comments. Following the plan would
   have imported a defect into the editor inside a refactor declared to have no
   user-visible effect.
2. **D2's label row was backwards.** `ActivityEditorDialog.test.tsx:130` had recorded
   since the editor shipped that "WBS summary" collides with the Type selector's option
   of the same name. Create kept the colliding label; the epic first "converged" onto it.
3. **D8's disclaimer placement.** Resolved toward the field's hint, then corrected to the
   section description: it is true of the whole section, and create had only one field
   there to attach it to, which is how it ended up in a hint on one host and a
   description on the other.
4. **Create's chooser hint** was kept, then dropped — it duplicated the section
   description the same commit had just introduced.
5. **A migrated test case was claimed as "already covered" and was not.** During M6 the
   29 edit-path cases were each given a named destination. One — a stored
   `LEVEL_OF_EFFORT` staying visible with `VITE_ADVANCED_ACTIVITY_TYPES` off — was said
   to be covered by the work group's suite. That suite never mocks the flag, and its
   sibling case uses a type the selector never offers **at all**, which is a different
   branch. It was caught by spot-checking the claim rather than accepting it, restored,
   and verified red. **This is exactly the failure ADR-0084 D5 exists to prevent, and it
   was found because the rule says to check, not because anything failed.**

The flag-on journey `apps/web/e2e-activity-editor/activity-create.spec.ts` landed with
**M2, its first user-facing milestone**, not at the end (ADR-0081 §2). It found three
defects on its first run — all in itself: `getByLabel` is a substring match, so one
absence assertion could never have failed.

## References

- `docs/specs/activity-dialog-unification/` — feature spec and implementation plan.
- ADR-0060 (per-scope save), ADR-0062 (convergence), ADR-0061 (form layout).
- ADR-0083 (a gated field is read-only, not disabled), ADR-0077 §9 (a field's problem is
  stated once).
- ADR-0084 D5 (coverage moves with a named destination), ADR-0088 (flag classification).
- ADR-0081 (a milestone names its entry point; the journey is the gate).
- ADR-0058 / ADR-0076 (verify the claim; do not trust the document).
- `docs/TECH_DEBT.md` #122.
