# ADR-0061 — Dialog layout: form-layout primitives, and the two-pane editor

- **Status:** Accepted
- **Date:** 2026-07-29
- **Supersedes:** nothing
- **Amends:** ADR-0060 (the activity editor's layout, not its save model)
- **Builds on:** ADR-0028 (the pen), ADR-0053 (the shared `Combobox`), ADR-0055 (surface scopes),
  ADR-0060 (per-scope save)

## Context

Every dialog body in this application was the same shape:

```tsx
<form className="flex flex-col gap-4">…fields…</form>
```

Eighteen dialogs, one layout. A one-field **Capture baseline** and a nine-field **Scheduling** tab
had _identical_ visual structure, which meant the structure said nothing: it could not indicate
which fields belonged together, which were consequential, or which were defaults nobody needed to
read.

Two measurements made the problem concrete rather than aesthetic:

1. `Dialog` defaults to `size="md"` — `max-w-md`, **448 px** — and neither the four-tab activity
   editor nor the eight-field resource form passed a size. The editor's Scheduling tab was roughly
   **940 px tall**, so its Save button sat below the fold on a laptop.
2. A constraint type and its date are **one decision**. At 448 px they cannot sit side by side, so
   they were stacked and read as two.

The immediate trigger was feedback on the ADR-0060 epic: the tabbing and the per-scope saves had
landed, and inside each tab there was still just a list of settings. That criticism was correct.
ADR-0060 restructured _which_ fields live together and _who may save them_; it did not touch how
any of them are laid out.

Three primitives that would have helped already existed and were unused in every dialog:
`card.tsx`, `surface.tsx`, `segmented-control.tsx`. That is the shape of the real problem — not a
missing component, but a missing **rule** about which component to reach for.

## Decision

### 1. The grouping vocabulary is a set of primitives, not a convention

`apps/web/src/components/ui/form-layout.tsx`:

- **`FormSection`** — a named group of related fields, with an optional one-line description and an
  optional right-aligned status. Sibling sections separate themselves, so no consumer hand-places a
  `border-t`.
- **`FieldGrid`** / **`FieldGridFull`** — two columns where two controls are one decision, one where
  there is no room. `FieldGridContainer` establishes the containment context.
- **`ContextStrip`** — the read-only facts an edit is _about_.

A Tailwind class cannot express "these two controls are one decision", so the fix has to be a
component that carries the grouping. The previous idiom — a hand-built `<fieldset>` with an
`sr-only` legend _and_ a duplicate `aria-hidden` paragraph — was repeated four times in one file and
had already drifted: the visible heading and the accessible name had been solved twice, separately.

**`role="group"` + a real `<h3>`, not `<fieldset>`/`<legend>`.** A `<legend>` only captions its
fieldset when it is that fieldset's first child, which rules out putting a status beside it on the
same row; and a fieldset's `min-width: min-content` default makes it refuse to shrink below its
widest child, silently overflowing a narrow dialog. The ARIA pair is exactly equivalent for
grouping, has neither constraint, and adds heading navigation for free.

**`FieldGrid` is a container query, not a breakpoint.** A dialog's width comes from its size preset,
not from the viewport: the activity editor is 896 px wide on the same desktop where a `md` dialog is
448 px. A `sm:` breakpoint gives both the same answer and is wrong for one of them. The threshold is
`@sm` (384 px), chosen against two real widths — a `md` dialog's 400 px body (splits) and the same
dialog on a phone at ~295 px (does not).

### 2. Direction A — grouping — applies to every dialog that has more than a couple of fields

Named sections, paired controls, and a context read-out where one is meaningful. Applied to:
the activity editor (all four tabs and the three progress panels), `ActivityFormDialog`,
`ResourceFormDialog`, `CalendarFormDialog`, `AddDependencyDialog`, `AddCrossPlanLinkDialog`,
`ShareLinksDialog`, `ActivityResourcesDialog` and `ImportScheduleDialog`.

**`ConfirmDialog` and `TsldShortcutsHelp` are deliberately untouched** — they are already right, and
churning them would be drive-by change. So are the simple record forms (client, project, plan,
baseline, invite, edit-dependency): a three-field dialog does not need sections, and adding them
would be ceremony.

The list/manage dialogs additionally **put what exists above the form that adds to it**. Share links
previously opened on a creation form above a table of the links already live, so the first thing a
planner saw was a way to make another one.

### 3. Direction B — a rail beside a pane — applies to the activity editor alone

At a new `Dialog size="xl"` (`max-w-4xl`, 896 px) with `body="flush"`, the editor's sections move
into a **vertical tablist** and the fields into a wide pane.

This is not "the editor is important so it gets more room". It is the same argument that made
per-scope save structural in ADR-0060: **the editor's scopes carry different permissions**, and a
horizontal tab strip has nowhere to say so. In the rail, a Contributor sees `General 🔒 /
Scheduling 🔒 / Progress` on arrival instead of discovering each shut form by clicking into it.

`Tabs` therefore gains `orientation="vertical"`. Its previous docblock said it would never grow an
orientation prop, citing `form.tsx`'s lesson about options added for hypothetical callers. That
lesson stands and this does not violate it: the option arrives **with** its consumer and its tests.
An option with a real caller is the opposite of the trap `form.tsx` records.

`TabMarker` becomes a discriminated union — `count` / `dot` / `locked`. The three states were being
inferred from whether a number happened to be present, which is how "3 problems" and "you cannot
edit this" ended up rendering as the same dot.

**Progress is never marked read-only**, because the pen deliberately does not gate it (ADR-0028
Q-C). A padlock there would be a lie in exactly the situation the rail exists to clarify.

### 4. The context strip withholds itself rather than showing em dashes

Before a plan's first recalculation every CPM column is null. A strip of five em dashes reads as
breakage, so `activityContextFacts` returns an empty array and the editor renders nothing. Free
float appears only when it differs from total float — showing "0 d / 0 d" teaches a reader the two
columns are the same thing.

### 5. `(optional)` leaves the remaining labels

ADR-0060 dropped it from the activity editor because it was on eleven of twenty-two labels, which
is enough that it stopped meaning anything. The dialogs that epic did not touch still carried it.
They no longer do; where optionality matters, the section description or the field hint says so.

## No feature flag — deliberately

Every recent visual epic shipped behind a `VITE_` flag with flag-off parity suites (ADR-0052,
ADR-0055, ADR-0059, ADR-0060). This one does not, and the reason is that the flag would cost more
than it protects.

Those epics gated **values and additive surfaces** — token families, a new view, a new dialog — where
the flag-off path is genuinely the old code, unchanged. This change is a **structural refactor of
nine existing dialog bodies with no behavioural difference**: no new API, no schema, no engine
contact, no new state. Gating it would mean keeping two copies of every restructured body in one
file and branching between them, which is a larger and more fragile artefact than the change itself
— and the second copy would rot, because nobody edits the branch they cannot see.

What stands in for the flag: the existing unit and Playwright suites, which query by **role and
label** rather than by structure, and therefore assert exactly the contract this change preserves.
Every one of them passes unchanged except where a label deliberately lost `(optional)`.

Two consequences are recorded here because they will recur — **a named group is addressable the
same ways a control is**:

1. `FormSection` renders `role="group"`, so a bare `querySelector('[role="group"]')` now finds the
   enclosing section. `ActivityFormDialog.scope.test.tsx`'s combobox tier-group assertion had to be
   scoped to the listbox; its sibling helper had already been scoped for exactly this reason.
2. The group carries an accessible **name** via `aria-labelledby`, so Playwright's `getByLabel` —
   substring-matching by default — matches it too. A section titled "Upstream activity" beside a
   field labelled "Activity" is a strict-mode violation
   (`e2e-programme/programme.spec.ts`), fixed with `{ exact: true }`.

Neither is a defect: naming a group is the point. Both were caught by running the Playwright suites
against a real stack **before** pushing, which is the practice ADR-0060's own post-merge CI failure
was supposed to have established and this change actually followed. Four suites' unit tests were
green while `e2e/activities.spec.ts` and `e2e-programme` were not.

## Consequences

- **The CPM engine, the API and the database are untouched.** The ADR-0034 recalc parity gate is
  structurally unaffected — no file under `apps/api/src/modules/schedule/engine/` is in this diff.
- `Dialog` gains `xl` and `body="flush"`; both default to today's behaviour, so no existing consumer
  changes. `xl` is documented as _for the two-pane layout only_ — widening a single-column form to
  896 px produces input rows nobody wants.
- `docs/DESIGN_SYSTEM.md` gains a **Form layout** section: the authoring rule, so the next dialog is
  not a judgement call. That is the part that makes this an improvement rather than a one-off.
- The editor's rail needs ~208 px before the pane's two-column grids start squeezing, so below
  `md` it falls back to the horizontal strip. That is a structural switch, which is what
  `useMediaQuery` is for rather than a CSS utility.

## Alternatives rejected

- **Direction C — progressive disclosure.** Lead with "when should this happen?" as a segmented
  control and fold the rest behind labelled disclosures with counts. The most interesting design of
  the three and the one with the most product opinion in it: hiding a planner's scheduling fields
  behind a count is a decision about the domain, not about layout. It composes with this ADR rather
  than replacing it, and if it is wanted it deserves its own decision.
- **Direction B everywhere.** A rail on a three-field dialog is pomp. Twelve of the eighteen dialogs
  would be worse for it.
- **A `FormRow` component taking a `columns` number.** Rejected for the reason `FieldGrid`'s
  container query exists: a caller passing a column count is a caller guessing at a width it cannot
  see.
