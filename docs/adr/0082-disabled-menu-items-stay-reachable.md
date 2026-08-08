# ADR-0082 — A shaded menu item keeps its focus, and its reason

**Status:** Proposed
**Date:** 2026-08-08
**Extends:** ADR-0062 M6 (present and shaded, never hidden, never a dead end) into the menu tier.
**Supersedes:** nothing. Reverses one tested posture of `components/ui/menu.tsx`, recorded below.

## Context

`docs/TECH_DEBT.md` #111: the activities-table row menu **omits** Edit, Duplicate, Dissolve and
Delete when the planner does not hold the ADR-0028 pen, while the canvas selection bar shades the
same actions and links a reason. One operation, two mental models, depending on which surface the
planner happens to be on.

It was deferred out of W5 for a reason that turned out to be the interesting part: `Menu`'s roving
focus **deliberately skips** `aria-disabled` items (`components/ui/menu.tsx:54`), so shading a menu
item makes the option visible and leaves its reason **unreachable by keyboard** — the same defect one
layer down. Deciding #111 therefore means deciding the primitive's posture, not the table's markup.

Three things established during the design pass changed the shape of the answer.

### 1. It is not a WCAG failure, and saying so matters

The accessibility assessment was explicit: **no success criterion requires unavailable functionality
to stay visible.** 2.1.1 does not apply (nothing is offered to operate); 4.1.2 does not (nothing is
misrepresented); 3.2.4 is about labelling across a page-set, not presence-versus-shaded across two
surfaces. This is a **design-system and usability defect against ADR-0062 M6** — a real reason to fix
it, and a different claim from the one this ADR's own author made when first raising it. Recorded so
the register does not carry an overstated citation.

### 2. The defect already ships in a second menu, whose comments claim the opposite

`components/ui/toolbar/ToolbarOverflow.tsx:82-102` renders a disabled overflow command as a bespoke
`<div role="menuitem" aria-disabled="true" tabIndex={-1}>` with a **`title`-only** reason. Its
comments say the row is _"focusable for AT with its reason"_ and _"Still an arrow-key stop in the
menu, so it needs a visible focus ring"_. **Both are false.** `itemsOf` filters it out, so it is not
a stop, its `focus:ring-2` can never fire, and its reason is reachable by hover alone. That is
verbatim the failure `ToolbarButton.tsx` records having shipped once — _"the sentence described the
intent and the markup did not"_ — sitting undiscovered in the primitive's own neighbour.

So #111 is not one surface behind two others. It is **one surface hiding and one surface claiming**.

### 3. The skip has two live consequences inside `Menu` itself

Both verified in the code rather than reasoned about:

- **The ArrowUp wrap is wrong when focus sits on a filtered-out item.** `menu.tsx:143` does
  `items.indexOf(document.activeElement)`, which is `-1`; ArrowUp then computes
  `items[(-1 - 1 + n) % n]` — the **second-to-last** item. Reachable today at
  `components/layout/account-chip.tsx:160`, where Sign out becomes `disabled` _while focused_.
- **A menu whose items are all disabled focuses nothing.** `menu.tsx:106` focuses `itemsOf(...)[0]`,
  which is `undefined`; focus stays on the trigger, which is **outside the portal**, so the
  container's React `onKeyDown` never sees the arrows and only Escape works. Reachable in the
  toolbar overflow when every demoted item is pen-gated.

### 4. The APG recommends the opposite of the current filter

Its _Developing a Keyboard Interface_ practice gives two conventions for disabled controls — remove
focusability with native `disabled` where presence can be inferred, or keep it with `aria-disabled`
where discoverability matters — and names **"Menu items in a Menu or menu bar"** in the second list.
So `menu.tsx:54` is the divergence from the pattern the primitive says it implements, and removing it
is a return to the APG rather than a departure from it.

## Decisions

### §1 — `itemsOf` stops filtering `aria-disabled`

Shaded menu items take roving focus. This is the load-bearing change: it is the only one that makes
the reason reachable, and it repairs §3's two bugs and §2's dead code at the same place. The
primitive's docblocks that teach the skip are updated with it.

**Accepted cost:** keyboard users arrow through inert items. The APG accepts this trade for menus;
these menus are "a flat list of a handful of actions" by design.

### §2 — `MenuItem` gains `disabledReason`, expressed exactly as `ToolbarButton` expresses it

An `sr-only` span plus `aria-describedby`, with the accessible **name pinned to the label**. Not
folded into the name: `ToolbarButton` pins its name for this reason and thirteen toolbar tests caught
the alternative the moment it was written. A name should identify the control; the reason is a
description. `busy` joins it, for parity with what `ToolbarOverflow` does today.

### §3 — The discriminating rule, because "shade, never hide" degenerates without one

| Why it is unavailable                                      | Treatment                                            |
| ---------------------------------------------------------- | ---------------------------------------------------- |
| Does not apply to this object (Dissolve off a non-summary) | **Omit**                                             |
| Feature flag off                                           | **Omit** — the flag-off parity suites depend on this |
| Nothing to show at all (`readable === false`)              | **Omit** — shading implies a value is there          |
| Shut by a state the reader can change (the pen)            | **Shade + reason**                                   |
| Shut by role                                               | **Shade + reason**                                   |
| Not built yet                                              | **Shade + "Coming soon"**                            |

Plus one clause that earns its keep three times: **a menu whose every item would be shaded renders no
trigger.** It preserves today's behaviour for the Project Explorer rail, removes §3's focus trap
rather than making it more reachable, and stops a Viewer meeting a menu of nothing but refusals.

### §4 — The row menu gates on the **same object** the editor already uses

`ActivitiesTable` shades from `editorGating.general` — the `ScopeGate` already threaded into it —
rather than a second `{ writable, reason }` assembled beside it. Pinned by an **identity** assertion,
the ADR-0062 precedent. This also closes `docs/TECH_DEBT.md` #112(5).

### §5 — No feature flag

ADR-0061's reasoning, and stronger here: this is a primitive's accessibility posture plus a gating
derivation, with no new capability. Gating it would mean two row menus in one file. The rollback
contract is the commit boundary plus the existing flag-off parity suite.

## Consequences

- Ten `MenuItem` consumers; four change. `HierarchyTree`/`tree-actions.ts` is **deliberately
  unchanged** — `nodeActions` returns `[]` for a non-writer, so §3's all-inert clause suppresses the
  trigger and behaviour is byte-for-byte today's. Recorded as a considered exclusion, not an
  oversight.
- `plan-actions-menu.tsx:62-66` hides "Edit plan…" on `!canWrite` — **a third instance**, included if
  the model exposes a reason sentence and recorded explicitly otherwise, rather than left to be
  re-found.
- **`Combobox` is knowingly left inconsistent.** It skips disabled options by arrow key, and the same
  APG list names _"Options in a Listbox"_ — but it is a separate primitive with its own consumers and
  tests, and changing it here widens the blast radius past what #111 needs. Filed as its own
  `docs/TECH_DEBT.md` entry with the citation. Noticing this and stepping over it silently would be
  the ADR-0071 failure.
- `menu.test.tsx`'s skip assertions are **rewritten**, and must read as a posture change carrying the
  APG citation rather than a test bent to fit new code.
- The CPM engine is not imported and no migration runs.

## Recorded corrections

- This ADR's author first described #111 as an accessibility blocker. The independent assessment
  found **no applicable success criterion**. The item is real and worth fixing on the house rule; the
  citation was overstated, and is corrected here rather than quietly dropped.
- `ToolbarOverflow.tsx`'s two comments asserted the opposite of what the code did — that a disabled
  row was focusable and an arrow-key stop. Preserved in §2 rather than silently deleted, because it
  is the second recorded instance of a docblock describing intent while the markup did something
  else, and the first was in the sibling primitive.

## Alternatives rejected

**Fold the reason into the accessible name** ("Duplicate — Start editing…"). Needs no primitive
change and the reason is visible text — but it re-introduces the exact defect `ToolbarButton` fixed
one primitive along, repeats one sentence across four shaded items, and makes the name narrate state.

**A single non-focusable description row in the menu.** One sentence, once — but it cannot carry
**per-item** reasons, and the toolbar's reasons already differ per item, so a shared note would be
accurate only by luck. It also leaves every §2/§3 defect in place.

**Route the row menu through the ADR-0031 toolbar registry.** That registry is a _toolbar_ model —
7-group taxonomy, prominence tiers, responsive overflow, canvas-typed context. Forcing a table row
through it is a large epic to fix a four-item menu.

**Keep hiding, add one explanatory affordance.** The action _names_ stay undiscoverable, so a planner
never learns what the row can do, and it invents a menu idiom nothing else in the product uses.
