# ADR-0083 — A gated form field is read-only, not disabled

**Status:** Proposed (filed as 0083 on 2026-08-09, registered in `docs/adr/README.md` and
CLAUDE.md §16 in the same commit — ADR-0071 sat uncited in the register for a whole epic and
ADR-0079 had its number taken between plan and milestone; both are why this is one commit)
**Date:** 2026-08-08
**Extends:** ADR-0082 (present and shaded, never a dead end) from the menu tier into the form tier.
**Amends:** `docs/DESIGN_SYSTEM.md` "Buttons" — its static-versus-flipping clause, narrowed and
partly overturned for fields (§D1). ADR-0061's form-layout vocabulary gains one member (§D4).
**Supersedes:** nothing.

## The proposed fill FAILS its own gate — measured 2026-08-09, before any CSS

This ruling says the treatment must dim the **chrome** and never the **value**, and that
`token-contrast.test.ts` should carry the new pair _before_ the CSS is written. That was done, and
the gate refused the mechanism the ruling proposed:

| Pair                                                          | Surface | Measured   | Needs |
| ------------------------------------------------------------- | ------- | ---------- | ----- |
| `--muted` / `--field-foreground` (the value in a gated field) | brand   | **1.01:1** | 4.5:1 |
| `--muted` / `--input` (its outline)                           | panel   | **2.88:1** | 3:1   |

1.01:1 is not marginal — on the fixed-navy brand surface `--muted` and `--field-foreground` are
very nearly the same colour, so a gated field's value would be invisible on the login screens. The
outline miss is small and still a miss.

**So `--field` → `--muted` is rejected**, and the ruling is wrong on that specific point. Everything
else stands: read-only over disabled, the per-control mechanisms, the five meanings of `disabled`,
the exemption argument that produced this check in the first place. It is the exemption argument
that _caught_ it — the reason to add the pair before the CSS was precisely that a dimmed fill might
not clear 4.5:1, and it does not.

**What has to happen before the primitive is built** (this is now M6's first task, not its last):

1. Decide the gated fill. Three candidates, none free: a **19th rebound name** (`--field-gated`,
   which §"a family is complete or it is a trap" argues against adding lightly); **no fill change at
   all**, carrying gated-ness on the border, cursor and the linked reason, which keeps the value
   legible by construction but makes a gated field look editable; or a **per-surface** value, which
   is what ADR-0055's scope machinery exists for and is the most likely answer given the failure is
   surface-specific (brand and panel, not page).
2. Re-add both pairs to `token-contrast.test.ts` and watch them pass.
3. Then write the CSS.

The two pairs are **not** left in the matrix meanwhile. A gate that is red on the day it lands gets
deleted rather than fixed (ADR-0058), and they would be asserting about a treatment no code
implements yet. They are recorded here instead, with their numbers, which is the thing that makes
step 2 checkable.

### RESOLVED — there is no gated fill, and the reason is structural

The three candidates collapse to two, because in ADR-0055's architecture a "per-surface value" **is**
a rebound name: `[data-surface]` rebinding is the only mechanism that gives a token a per-surface
value at all. So the question was whether **any** fill can work, and it was settled by measurement
rather than by argument.

**Method.** A throwaway probe under `apps/web/src/styles/`, reusing `token-contrast.test.ts`'s own
`resolve()`/`ratio()` — the real cascade replay, not a second implementation — swept each family's
`--field` by ±0.04…0.12 in oklch L across 3 themes × 5 surface scopes × 2 flag states, and reported
the candidate's ratio against `--field-foreground` (needs 4.5:1) and against `--input` (needs 3:1).

**Result.** Darkening the fill spends the _outline's_ headroom, not the value's, and there is barely
any:

| Theme / scope       | `--field`                | `--input` vs `--field` | at L − 0.04 | at L − 0.06 |
| ------------------- | ------------------------ | ---------------------- | ----------- | ----------- |
| Light, page / panel | `oklch(1 0 0)`           | 3.36:1                 | **2.99:1**  | **2.82:1**  |
| `auth`, every theme | `oklch(0.962 0.005 252)` | 3.35:1                 | **2.67:1**  | **2.51:1**  |

Every light-theme surface fails WCAG 1.4.11 at a shift of 0.04 — a difference so slight it is barely
a treatment. The `auth` family has no margin at all **by construction**: ADR-0077 M7 derived
`--auth-input` specifically to land at 3.01–3.36:1 on exactly the current `--field`, because the old
app's own outline measured 2.22:1 and had to be repaired. Lightening is not available either — on
four of the five families `--field` is already `oklch(1 0 0)`.

**So the fill does not change, and D6 is corrected below.** A treatment that could only appear on the
Dark theme would teach a cue that is not there on the other two, which is worse than no cue.

**What this buys.** The 18-name vocabulary stays intact, and the gated field's pairs are
`--field`/`--field-foreground` and `--field`/`--input` — **already in `TEXT_PAIRS` and
`NON_TEXT_PAIRS`**, lines 95 and 121. Step 2 is therefore satisfied by the pairs that were already
there, which is the tidiest possible outcome and not one anybody predicted: the treatment is covered
by the matrix _because_ it reuses the tokens the matrix already gates.

**What replaces the fill** is in the corrected D6: the value at full contrast, the outline untouched,
`readOnly`, a linked reason sentence, and a **lock glyph beside the label** — a shape rather than a
colour, which is what WCAG 1.4.1 asks for and what the fill was never going to deliver anyway.

## Blast radius — settled, with the method recorded

**38 `disabled=` props passed to a `*Field` component, across 8 files.** Two files carry 30 of them.

Recorded with its method because three passes produced three numbers — 38/8, 83/26 and 145/63 —
and the disagreement was never about the code. 145/63 and 83/26 counted `disabled=` on **any**
component, buttons included; only 38/8 answered the question this ruling is about. A number without
its method is how that happens.

The method: for each `<TextField|SelectField|CheckboxField|TextareaField|NumberField|DateField`,
scan forward brace-aware to the matching `>` at depth 0 and count `disabled=` inside that element.
Brace-aware matters — the original grep bounded on `[^>]*`, which stops at the first `>` and
silently drops every call site whose props contain an arrow function.

| File                                                                     | Count |
| ------------------------------------------------------------------------ | ----- |
| `features/activities/components/ActivityEditorDialog.tsx`                | 19    |
| `features/activities/components/ActivityProgressPanels.tsx`              | 11    |
| `features/cross-plan-dependencies/components/AddCrossPlanLinkDialog.tsx` | 3     |
| five others, one each                                                    | 5     |

Two consequences for the migration. It is **M, not L** — the concentration means most of the work
is two files, not a sweep. And `AddCrossPlanLinkDialog`'s three are the **prerequisite-cascade**
kind ("choose a plan before an activity"), not a permission gate, so under §"`disabled` means five
things" they keep native `disabled` and are not part of the migration at all.

## Context

`docs/TECH_DEBT.md` #64 and #66 are the same question from two sides: a definition field is
natively `disabled` when the scope is un-writable (#64), and a create form's fields are **not**
gated at all while its Save is (#66), so a member who cannot write can fill in a whole form and
meet the refusal at the end of it. Neither can be sized until somebody rules on what a gated field
_is_.

`features/wbs/components/WbsBulkAssignBar.tsx` holds the whole inconsistency in one component,
eighteen lines apart: line 110 is `<SelectField … disabled={!gate.writable}>`, and line 122–130 is
a `Button` carrying `aria-disabled={blocked}` under a five-line comment explaining that the native
attribute would drop focus to `<body>`. One gate, one component, two opposite treatments, each with
a defensible rationale. That is not a bug anyone will find by reading a diff; it is a missing rule.

### 1. What is actually there — the brief's figures corrected

Measured today with `rg` over `apps/web/src` (multiline, `<Component …disabled=`):

| Consumer                                                        | `disabled` props |           Files |
| --------------------------------------------------------------- | ---------------: | --------------: |
| `TextField` / `SelectField` / `CheckboxField` / `TextareaField` |               38 |               8 |
| Raw `Input` / `Select` / `Textarea` / `Combobox`                |               16 |              10 |
| **Field-shaped total**                                          |           **54** | **16 distinct** |

For context, `disabled=` appears 147 times across 65 `.tsx` files overall — nearly all of them on
`Button`, where `docs/DESIGN_SYSTEM.md` already rules.

The brief's "37 across 32 non-test files" is right about the order of magnitude and wrong about the
shape: the `*Field` count is 38 (an earlier grep bounded on `[^>]*`, which stops at the first `>`
and therefore silently loses every call site whose props contain an arrow function — the same
pattern hid `ActivityCalendarField`'s `Combobox` entirely), and they sit in **8** files, not 32.
That matters for sizing in the right direction: **86% of the field-level blast radius is in three
files** — `ActivityEditorDialog.tsx` (19), `ActivityProgressPanels.tsx` (11) and
`AddCrossPlanLinkDialog.tsx` (3).

### 2. `disabled` on a field means five different things, and one of them is fine

Classified by reading every one of the 38:

| Reason it is disabled                             | Sites | Example                                                                    |
| ------------------------------------------------- | ----: | -------------------------------------------------------------------------- |
| **Permission / pen** — the ADR-0060 `ScopeGate`   |    30 | `ActivityEditorDialog.tsx:499` `disabled={!gating.general.writable}`       |
| **Prerequisite not yet answered** (a cascade)     |     3 | `AddCrossPlanLinkDialog.tsx:230` `disabled={clientId === ''}`              |
| **Domain irrelevance** — another field decides it |     2 | `ActivityResourcesPanel.tsx:431` `disabled={selectedIsMaterial}`           |
| **In-flight mutation**                            |     1 | `PlanCriticalFloatThresholdField.tsx:121` `disabled={setOption.isPending}` |
| **Options still loading**                         |     1 | `ActivityFormDialog.tsx:508` `disabled={planActivitiesLoading}`            |

(One site is compound: `ActivityProgressPanels.tsx:314` is `!gate.writable || stepsWin` — a
permission gate **or** a domain rule, needing two different sentences.)

So a ruling of the form "never use native `disabled` on a field" would be wrong. Rows 2 and 5 have
**nothing to read**: an unloaded picker and a plan select before a project is chosen hold no value,
offer no fact, and resolve by the reader's own next action rather than by somebody else's. Native
`disabled` is correct there and this ADR leaves it alone. Everything else is the subject.

### 3. The load-bearing finding: the platform is not symmetric

The brief asks whether the answer differs per control. It does, and not by degree — the HTML
platform simply does not offer the same states:

| Control                            | `readonly` attribute? | What a "cannot write" state can be enforced by                                                                                                                                                                                          |
| ---------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<input type=text\|number\|date…>` | **Yes**               | The platform. `readonly` makes the element immutable, keeps it focusable, keeps its value selectable and copyable, and maps to `aria-readonly`.                                                                                         |
| `<textarea>`                       | **Yes**               | The platform, identically.                                                                                                                                                                                                              |
| `<input type=checkbox>`            | **No**                | One cancellable event. `preventDefault()` on `click` triggers the legacy-canceled-activation behaviour and restores the pre-click checkedness — and `click` is dispatched by pointer **and** by Space, so a single handler is complete. |
| `<select>`                         | **No**                | **Nothing complete.** `change` and `input` are not cancellable; a value can be committed by arrow keys, typeahead, `Home`/`End`, `Alt+Down`+`Enter`, a pointer, or a platform picker on touch.                                          |

This is the fact the whole ruling turns on, and it is why "just use `aria-disabled` everywhere, like
the buttons" is not available. **ARIA never changes behaviour.** `aria-disabled` on a `<button>` is
honest because the button's guard is one `onClick` — the pattern `ScopeSaveBar` and `ToolbarButton`
already implement. `aria-disabled` on a text input with no `readonly` beside it is a **lie**: the
user types, the attribute says they cannot, and the value changes.

### 4. Why fields are not menu items

The brief asks whether ADR-0082's omit-vs-shade table extends to fields. It extends, but its
_reason_ inverts, and saying so is what keeps the two rules from being cargo-culted into each other.

The APG's _Developing a Keyboard Interface_ practice keeps disabled controls focusable "in
circumstances where **discoverability of a function** is crucial", and its examples are
composite-widget cases — menu items in a menu or menu bar, buttons in a toolbar, options in a
listbox, cells in a grid. ADR-0082 §4 quotes the first of those; ADR-0082's own consequences quote
the third. **A field in a form is in none of them**, and the APG's default sentence — that it is
not necessary to include disabled elements in the tab sequence — applies to it.

So fields do not get the ADR-0082 treatment because of the APG. They get an equivalent one for a
different reason: **a menu item's content is its function, and a field's content is its value.** A
menu of nothing but refusals offers the reader nothing, which is why ADR-0082 rules that it renders
no trigger at all. A form of nothing but shaded fields offers the reader **the data**, which is
exactly what they opened it for. That asymmetry decides four cases at once and is the ADR's central
rule (§D3).

### 5. Making a field readable costs contrast, and the gate is already built

Every primitive today carries `disabled:cursor-not-allowed disabled:opacity-50`
(`input.tsx:20`, `select.tsx:18`, `textarea.tsx:20`). That is lawful **because the control is
inactive**: WCAG 1.4.3 and 1.4.11 both exempt "an inactive user interface component".

The moment this ADR makes a gated field focusable, selectable and read-only, **that exemption stops
applying to it**, and `--field-foreground` at 50% opacity over `--field` is nowhere near 4.5:1 in
any of the three themes. This is not a nit noticed later; it is a direct consequence of the
decision, and ADR-0055 already built the machine that will catch it —
`apps/web/src/styles/token-contrast.test.ts` computes ratios across three themes and every surface
scope. It carries `['--field','--field-foreground']` and `['--muted','--muted-foreground']` today
and **not** the pair this ADR introduces.

## Decisions

### D1 — The mechanism is per control, and it is not a preference

| Control                              | Gated treatment                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------------- |
| Text-ish `input`, `textarea`         | **`readOnly`.** No `aria-disabled`.                                                       |
| `checkbox`                           | **`aria-disabled` + `preventDefault()` on `click`.** Stays in the tab order.              |
| Native `select`                      | **Native `disabled`.** A deliberate, named exception — see below.                         |
| `Combobox` (our own)                 | **`readOnly` on its text input**, `aria-disabled` on its toggle, listbox refuses to open. |
| `Button` / `MenuItem` / toolbar item | Unchanged — `aria-disabled` + guard (`DESIGN_SYSTEM.md`, ADR-0082).                       |

The discriminator, stated so the next control is not a judgement call:

> **A control whose only operation is to change its value is `aria-disabled` plus a guard on the one
> event that changes it. A control with operations beyond changing its value — caret placement,
> selection, copy — is `readOnly`, because that removes mutation and keeps the rest, which is
> precisely what "you may read this but not write it" means.**

**No `aria-disabled` on a read-only text field.** It would be a false statement: the field _is_
operable — you can focus it, place a caret, select and copy. This repo has now twice shipped an
accessibility layer that said something untrue (ADR-0064's Cancel announcing "unavailable" while
lit; ADR-0060's invented pen sentence) and both times the fix was to stop asserting the thing that
was not so. `readonly` already maps to `aria-readonly` through HTML-AAM; adding a second, contrary
state is redundant ARIA and a worse announcement.

**The `<select>` exception, and its cost.** There is no read-only select and no complete guard for
one (§3). The three escapes were each considered and rejected in "Alternatives". The accepted cost
is that a gated select leaves the tab sequence: a keyboard-only user cannot land on it, and its
value is not copyable. It is still in the accessibility tree, so a screen-reader user reads both the
label and the value in browse mode — which is the difference between this and a hidden menu item,
and the reason the cost is tolerable rather than disqualifying. The exception is expected to shrink
on its own: as pickers migrate to `Combobox` (`docs/TECH_DEBT.md` #42), they cross into row 4.

### D2 — Native `disabled` keeps exactly two jobs on a field

**Prerequisite not yet answered**, and **options still loading** (§2 rows 2 and 5). Both hold no
value, both resolve by the reader's own next action, and neither can flip under a reader who is not
the one causing it. Everything else — permission, pen, in-flight save, domain irrelevance — is a
gate.

This is the narrowing of `docs/DESIGN_SYSTEM.md`'s existing clause, which the brief correctly
identifies as the thing to confirm, narrow or overturn. That clause says native `disabled` "remains
correct for a control that is **statically** unavailable (no permission, nothing selected), where
nothing flips underneath the user". Two corrections:

1. **"No permission" is not static.** The ADR-0028 pen can be taken by a peer mid-session, so
   `canEditSchedule` flips under a reader who did nothing. The clause names as its example the one
   case that disproves it.
2. **Static-versus-flipping is the wrong axis for a field anyway.** It is the right axis for a
   button, whose only loss on being disabled is operability. A field's loss is _readability_, and
   that loss is the same whether the state is static or not. So for fields the axis is **is there
   something to read** (§D3), and the mechanism is decided by §D1.

The clause's button ruling is untouched and correct.

### D3 — Shade what has something to read; omit what does not

The one rule, derived from ADR-0082's `readable === false` clause and replacing four separate
judgement calls:

| Surface                                                    | Gated treatment                                                             |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| An **edit** form / panel (fields hold values)              | **Shade the fields.** All of them, plus the Save.                           |
| A **create** form (fields are empty by definition)         | **Collapse to the section heading + the reason.** No blank shaded controls. |
| A row of editors over an existing record (`AssignmentRow`) | **Shade.** See §D5.                                                         |
| A menu                                                     | Unchanged — ADR-0082 (omit; no trigger when all would shade).               |

So **yes, a gated form shades its fields, not only its submit** — closing #66 in the direction its
own remediation note asked for. A form that accepts twenty fields of input and refuses at the last
click is a data-loss trap, and it is the exact "lit but inert dead end" this codebase has now
recorded four times (ADR-0059 M6, ADR-0062 M6, ADR-0064 §7, ADR-0081).

And the create-form branch is why the rule is phrased around _readability_ rather than "always
shade": `AddLinkSection.tsx:180-234` gated would be five empty controls the reader can neither read
nor fill. It already renders exactly the right shape for the adjacent case — a bordered explanatory
box in place of the form when the plan has no other activities to link to
(`AddLinkSection.tsx:163-167`). Reuse it verbatim, with the gate's reason as its copy.

### D4 — The reason is rendered once per group, and every field points at the same node

Per-field reasons would repeat one sentence nineteen times in the activity editor's Scheduling tab.
Per-section-only reasons leave a field unexplained when a field carries its _own_ reason. Both are
avoided by one node and N references, which is what `aria-describedby` is for — and
`SelectField`'s docblock already contemplates callers pointing at "a shared explainer paragraph
rendered elsewhere on the screen", which is why `mergeDescribedBy` exists.

New primitive, `components/ui/field-gate.tsx`, joining ADR-0061's form-layout vocabulary:

```tsx
/** Structurally compatible with ADR-0060's `ScopeGate`, so an editor gate satisfies it unchanged. */
export interface FieldGate {
  writable: boolean;
  reason: string | null;
}

/**
 * Renders the group's reason ONCE, above the fields, and publishes its id through context.
 * Every `*Field` inside describes itself with that node instead of printing a copy.
 * The paragraph is real, visible text — not `sr-only` — because a sighted keyboard user
 * needs it too, and because a gated `<select>` is out of the tab sequence (D1) and the
 * visible sentence is then the only channel that reaches everyone.
 */
export function FieldGateProvider(props: {
  gate: FieldGate;
  children: React.ReactNode;
}): React.ReactElement;

/** `null` when no provider is above. */
export function useFieldGate(): { writable: boolean; reasonId: string | undefined } | null;
```

and on each field:

```ts
export interface TextFieldProps extends InputProps {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  /**
   * This field's own gate. Overrides an inherited group gate — the **nearest reason wins**, because
   * a specific one is always more useful than a general one (`ActivityCalendarField`'s
   * RESOURCE_DEPENDENT sentence beats "Start editing to change this activity").
   * `null` opts out of an inherited gate entirely, for a control that stays live inside a
   * read-only region (a filter, a search box).
   */
  gate?: FieldGate | null;
  /**
   * Native `disabled` — kept for D2's two states ONLY: the options have not loaded, or a field
   * above this one has not been answered. Never a permission, a pen, an in-flight save or a
   * domain rule; those are `gate`. The compiler cannot tell the two apart, which is why this
   * docblock and the structural test in D7 both exist.
   */
  disabled?: boolean;
}
```

`aria-describedby` order becomes **own error → own hint → gate reason → caller's** — the field's own
problem first, then what it is for, then why it is shut.

### D5 — `AssignmentRow` shades its editors and its read-only summary branch is deleted

`AssignmentRow.tsx:511` is `{canWrite ? (…eight editors…) : (<p>… summary …</p>)}`. It is the worst
case in the cluster and it is worst for a reason nobody has written down: it is not merely a focus
drop, it is a **second rendering of the same eight facts**, which is precisely what ADR-0062 refused
to allow between the Logic tab and the Logic dialog ("extracted, not reimplemented"), on the grounds
that the drift would be invisible — each looks right alone. It also discards unsaved local state:
`units`, `rate` and `lag` are component state, so a peer taking the pen while a planner has typed
`4h` into the join delay deletes that text along with the control.

So: delete the summary branch, shade the editors under one `FieldGateProvider` per row.

Two consequences, both accepted and named. A Viewer now sees more chrome than the one-line summary
they see today — accepted, because the shaded row still shows every value, which is what a summary
was for. And the row's three per-field Save buttons shade rather than vanish, matching
`ScopeSaveBar`; the one at `AssignmentRow.tsx:655` already does this correctly and its siblings at
`:534`, `:576` and `:684` still use the native attribute, which this milestone fixes in passing.

**Considered and rejected: split by whether the refusal is changeable** — role refusals collapse to
a summary (a Viewer never meets a wall of shaded controls), pen refusals shade (the state flips and
input would be lost). It is a genuinely attractive rule and it dies on ADR-0062: it requires a
second, read-only rendering of the General, Scheduling and Cost tabs, which is a large amount of new
code whose only job is to drift from the code beside it. Recorded because it is the first thing the
next reader will propose.

### D6 — The shaded treatment dims the chrome, never the value

Because §5 removes the inactive-component exemption:

- The **value** keeps `--field-foreground` at full opacity. It is content now, and it is gated at
  4.5:1.
- The **fill** stays `--field`. ~~moves from `--field` to `--muted`~~ — struck, and the reason is in
  §"RESOLVED" above: darkening a gated field's fill spends the outline's 1.4.11 headroom, of which
  every light-theme surface has 0.36 and the `auth` family has none. **No token is added and none
  changes**, so the 18-name vocabulary and its set-equality gate are untouched.
- The **border** stays `--input`, which ADR-0055 gates at 3:1 as a control boundary and which
  ADR-0077 M7 re-derived after the computed matrix caught two real 1.4.11 failures. Do not dim it:
  the boundary is what identifies the thing as a control at all. (This is now doing more work than
  the original draft realised — it is the constraint that killed the fill.)
- The **label** keeps its own colour and gains a **lock glyph** beside it (`FieldGateLock`),
  `aria-hidden` because the state is already announced twice: `readonly` maps to `aria-readonly`
  through HTML-AAM, and the reason is linked by `aria-describedby`.
- The state is therefore signalled by a **shape** and by the visible reason sentence — two channels,
  neither of them colour, which clears WCAG 1.4.1 more convincingly than a fill would have.
- `disabled:opacity-50` stays exactly as it is for D2's two native cases — those components really
  are inactive and really are exempt.

`token-contrast.test.ts` needs **no new pair**: the gated field's fill/ink and fill/outline pairs are
`--field`/`--field-foreground` (line 95) and `--field`/`--input` (line 121), both already asserted
across every theme, scope and flag state. The treatment is covered by the matrix because it reuses
the tokens the matrix already gates.

### D7 — This is a `docs/DESIGN_SYSTEM.md` rule _and_ an API _and_ a structural test

All three, because two of them alone have already failed here. The rule without the API is what we
have now — 38 call sites each making the same decision. The API without a gate is what ADR-0082 and
ADR-0064 both record: a correct pattern applied to one control and not its neighbour, four times.

The gate is a **source-text structural test**, not the compiler, because the compiler cannot see the
difference between a legitimate `disabled={optionsLoading}` and a gate: they are the same prop, the
same type. Following `surface-seams.structural.test.ts` and the colour-literal lint rule:

> No `*.tsx` under `apps/web/src` passes a `disabled` prop to `TextField`, `SelectField`,
> `CheckboxField`, `TextareaField`, `Input`, `Select`, `Textarea` or `Combobox` whose expression
> mentions `writable`, `canWrite`, `holdsPen`, `gate`, `gating` or `isPending`.

Verify it **red first** against the current tree — it should report all 30 permission sites plus the
in-flight one — which is also how the migration gets its checklist for free.

Documentation lands in `docs/DESIGN_SYSTEM.md` under "Forms & inputs" (whose existing text already
promises "disabled/readonly styles defined once" — a promise the codebase has never kept), with a
cross-reference from the "Buttons" clause so the two rules are read together, and in
`docs/COMPONENT_LIBRARY.md` beside the `Menu` contract ADR-0082 added.

### D8 — The host announces the flip; the primitive does not

`readOnly` keeps focus where it was, so WCAG 2.4.3 stops being at issue for text, textarea and
checkbox. What no primitive can fix is that **nothing tells the reader the pen was taken** — they
keep typing into a field that will refuse to save. The host that owns the gate (the editor, the
resources panel) announces a writable → read-only transition once, through the existing announcer,
and for a scope containing a gated `<select>` moves focus to the group's reason paragraph
(`tabIndex={-1}`) if the flip landed on it.

This is the host's job because only the host knows the transition happened; a field sees a prop
change and cannot tell a re-render from a hand-off. `Combobox` already documents this exact remedy
for this exact cause (`combobox.tsx:106-110`, `inputRef` exists "chiefly restoring focus after a
`disabled` spell").

### D9 — No feature flag

ADR-0061's reasoning and ADR-0082's strengthening of it: an accessibility posture plus a styling
change across shared primitives, with no new capability. Gating it would mean two renderings of nine
dialog bodies in one file — the very thing D5 deletes. The rollback contract is the commit boundary,
and the milestones below are each independently revertible.

## Migration — 54 call sites, and how mechanical each part is

**Mechanical (30 sites, 3 files).** Every `disabled={!gating.X.writable}` / `disabled={!gate.writable}`
is **deleted**, and the enclosing tab or section is wrapped in one `FieldGateProvider gate={gating.X}`.
`ActivityEditorDialog` needs three providers for nineteen deletions; `ActivityProgressPanels` needs
three for eleven; `WbsBulkAssignBar` one for one. The compound
`ActivityProgressPanels.tsx:314` (`!gate.writable || stepsWin`) keeps a field-level `gate` carrying
the steps sentence, which the nearest-reason rule then prefers over the group's.

**Not mechanical, and small (6 sites).** `AddCrossPlanLinkDialog`'s three cascade selects and
`ActivityFormDialog`'s loading select keep native `disabled` under D2 — the change there is a
docblock, not code. `ActivityResourcesPanel:431` and `AssignmentRow:600` (`isMaterial`) become
field-level `gate`s carrying the material sentence they already have as a `hint`.
`PlanCriticalFloatThresholdField:121` becomes a `gate` on the in-flight save.

**Not mechanical, and real (2 files).** `AssignmentRow` (D5, delete the summary branch, move six
hand-rolled `Input`/`Select` controls onto the treatment) and the two create forms (D3,
`AddLinkSection:180-234` and `ActivityResourcesPanel`'s assign form collapse to heading + reason).

**Suggested slicing.** M0 primitives + tokens + the contrast pair + the structural test (verified
red). M1 the 30 mechanical deletions. M2 the create forms (#66). M3 `AssignmentRow` (#64's worst
case). M4 the docs, and the journey.

**The journey.** Per ADR-0081, a milestone claiming user-facing capability names its entry point and
the flag-on journey lands with it. There is no new flag here, so the step goes into the existing
`apps/web/e2e-edit/pen-handoff.spec.ts` — the only place in the repository where the shaded and the
writable state are the same control, for the same person, either side of a **real** pen hand-off
against a real API. That is the only place `readOnly`-keeps-focus is testable at all: jsdom will
happily assert the attribute and can tell you nothing about whether the browser moved focus.

## Consequences

- **Closes `docs/TECH_DEBT.md` #64 and #66.** Both were explicitly blocked on this decision and
  both remediation notes asked for exactly this ("extend the `aria-disabled` treatment … to the form
  primitives"; "decide the pattern once — a `readOnly` pass-through on the form primitives, or a
  section-level treatment"). The answer is: **both, and they are different mechanisms for different
  controls**, which is the part neither note anticipated.
- **Covers #17(a) by extension** — the Members UI's pending-mutation controls. That is the in-flight
  case, which D1/D2 rule on; it needs no separate decision, only the same migration.
- **#21(a) and #72 are _not_ blocked by this ruling**, and the brief's five-item cluster is really
  three plus two neighbours. #21(a) is a required-field indicator and #72 is `CheckboxField`'s hit
  target and visually-hidden-label support; neither has any dependency on what disabled means, and
  both can be sized today. They belong in the same milestone because they touch the same 376-line
  file and the same four components — a scheduling argument, not a blocking one. Saying so is worth
  more than agreeing: two of the five were waiting on nothing.
- `docs/DESIGN_SYSTEM.md`'s "Buttons" clause is narrowed (D2) and its "Forms & inputs" entry finally
  acquires the "disabled/readonly styles defined once" it has always claimed.
- `ScopeSaveBar` is **unchanged**. Its `gate` prop is already structurally `{ writable, reason }`,
  which `FieldGate` matches deliberately, so the eight consumers keep working and a scope's Save and
  its fields read the same object. Whether the save bar should render its own reason once the group
  renders one is a follow-up, not a blocker: two sentences saying the same true thing is a nit, and
  removing one is a change to eight call sites for no accessibility gain.
- **The CPM engine is not imported, no migration runs, no API changes**, so the ADR-0034
  recalculation parity gate is untouched by construction.

## Alternatives rejected

**`aria-disabled` on every field, matching the buttons.** The most tempting answer and the one the
house rule appears to imply. Rejected because ARIA changes nothing: without `readonly` beside it the
user still types, so the attribute is false — and for `<select>` there is no "beside it" to add.

**Emulate read-only on `<select>`** — `preventDefault` on `mousedown` (stop the popup) and on
`keydown` (stop arrows, typeahead, `Home`/`End`, `Alt+Down`), with an `onChange` revert as backstop.
Rejected: `change` is not cancellable, the revert requires the component to own the value (every
`SelectField` here is RHF-`register()`ed and therefore uncontrolled), and platform pickers on touch
are opened by the browser, not by an event we can cancel. It would work on the reviewer's laptop and
half-work somewhere else, silently — the failure mode this repo has now paid for repeatedly.

**Disable every `<option>` except the selected one.** Declarative, platform-enforced, keeps the
select focusable — genuinely clever. Rejected: `SelectField` receives its options as `children` and
does not know the current value (uncontrolled again), so it would have to clone and inspect a
children tree containing fragments, maps and `<optgroup>`s; and it invents an idiom nothing else in
the product uses to solve a problem `Combobox` migration removes anyway.

**Swap a gated `<select>` for read-only text.** Informationally identical and fully accessible — but
it unmounts the control, which drops focus on the flip (the defect being fixed) and changes the
element's role mid-session. Reconsider it when a picker is `Combobox`-backed and the component owns
its value.

**Shade only the submit and leave the fields live** (today's create-form behaviour). Rejected in D3:
it is a data-loss trap and it defers the refusal to the last possible moment.

**A `renderControl`-style escape hatch on the fields for bespoke gated rendering.** Rejected on the
recorded history sitting in `form.tsx:88-103`: one was added for the flag-forked pickers and removed
the same day because it shipped with no consumer, no test, and a signature that could not do the job
it existed for.

## Claims in this document, and what established them

Per CLAUDE.md §19.9 / ADR-0076, the decision-bearing ones:

- **Counts and classification (§1, §2)** — `rg` over `apps/web/src`, multiline, pattern
  `<(TextField|SelectField|CheckboxField|TextareaField)\b[^<]*?\bdisabled=`; each of the 38 read at
  its call site. The `[^<]` bound matters: the `[^>]*` form undercounts, which is how the brief's
  own figure was produced.
- **The primitives carry `disabled:opacity-50`** — `input.tsx:20`, `select.tsx:18`,
  `textarea.tsx:20`, read today.
- **`WbsBulkAssignBar` holds both treatments** — `:110` and `:122-130`, read today.
- **`AssignmentRow` unmounts rather than disables** — `:511` (`canWrite ? … : …`), with the editors
  at `:517-689` and the summary at `:704-716`.
- **Create forms gate only the save bar** — `AddLinkSection.tsx:236` `gate={gate}` against ungated
  fields at `:180-234`; `ActivityResourcesPanel.tsx:540-541` against its fields above.
- **ADR-0055's vocabulary is 18 names behind a set-equality gate** —
  `token-architecture.test.ts:83-102` and `:173`.
- **The contrast matrix does not carry the pair D6 needs** — `token-contrast.test.ts:86-110`; it has
  `--field/--field-foreground` and `--muted/--muted-foreground`, not `--muted/--field-foreground`.
- **The APG quotation (§4)** — the practice's "discoverability of a function" framing and its
  composite-widget examples, as already quoted into this repository by ADR-0082 §4 and its
  consequences section. `www.w3.org` is unreachable from this environment, so the primary text was
  **not** re-read today; re-read it at M0 and correct §4 if it has moved. ADR-0082's reading is a
  secondary source and is being treated as one.
- **Unverified, and it must be verified before this ADR is Accepted:** how NVDA, JAWS and VoiceOver
  actually announce a `readonly` field carrying an `aria-describedby` reason, and whether Chrome and
  Safari suppress the date-picker indicator on a `readonly` `type="date"` input. D1 is reasoned from
  the specifications, not observed. Both are one manual pass at M0 and both could change D1's text
  for date inputs specifically — which is the honest state of this claim, not a caveat added to look
  careful.

  > **Partially discharged 2026-09-02, in Chromium 1194 (Playwright), and the residue is named.**
  > Two things were observed rather than reasoned:
  >
  > - **`showPicker()` on a `readonly` date input throws `InvalidStateError`**, exactly as it does on
  >   a `disabled` one, while it resolves on a plain one. So the platform does refuse to open the
  >   picker programmatically for a read-only control — the substance of the second claim.
  > - **`readonly` keeps the control focusable and `disabled` does not** (`document.activeElement`
  >   after `focus()`: true, true, **false** for plain / readonly / disabled). That is D1's whole
  >   premise, and it is now observed on this platform rather than taken from the specification.
  >
  > **What is still NOT verified, and why:** whether the picker _indicator glyph_ is visually
  > suppressed cannot be measured here — `getComputedStyle(el, '::-webkit-calendar-picker-indicator')`
  > silently falls back to the element, proved by a control that asked for a **nonsense**
  > pseudo-element and got the identical width, so the first reading of this claim measured nothing
  > and was discarded. **Safari was not tested at all**: only Chromium is installed in this
  > environment, and Playwright's WebKit would not be Safari even if it were. And the AT half — the
  > announcement — needs a real screen reader and a person, which no instrument here substitutes for.
  >
  > So the claim moves from _reasoned_ to _partially observed_, and acceptance still waits on the AT
  > pass and on Safari.

## Checklist for the implementer

1. Read `docs/DESIGN_SYSTEM.md` "Buttons" + "Forms & inputs" and ADR-0082 §3 before writing code —
   the omit-vs-shade table is being extended, not replaced.
2. M0: `field-gate.tsx`; the `--muted/--field-foreground` pair added to `TEXT_PAIRS` **first**; the
   D7 structural test, verified red; the AT and `type="date"` pass from the claims section above.
3. M1: delete the 30 gate `disabled` props, add three + three + one providers. No visual regression
   is expected in the writable state — the existing suites query by role and label, which is the
   contract being preserved (the ADR-0061 precedent).
4. M2: collapse the two create forms; reuse `AddLinkSection.tsx:163-167`'s existing box shape.
5. M3: `AssignmentRow` — delete the summary branch, move the six hand-rolled controls onto the
   treatment, fix the three native-`disabled` Saves at `:534`, `:576`, `:684`.
6. M4: `DESIGN_SYSTEM.md`, `COMPONENT_LIBRARY.md`, and the `pen-handoff.spec.ts` step.
7. Run the pre-push gate **including** `scripts/e2e-local.sh web:edit`. A unit test cannot tell you
   the browser kept focus.
8. Delete #64 and #66 from `docs/TECH_DEBT.md`, add both numbers to Closed numbers, and rewrite
   #17 to be about what is left of it.
