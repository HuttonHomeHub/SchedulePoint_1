# ADR-0117 — An icon-only control names itself, and a tooltip states its purpose

- **Status:** Accepted (fix-slice M-B landed 2026-08-28)
- **Date:** 2026-08-28
- **Spec:** [`docs/specs/fix-slice-2026-08/`](../specs/fix-slice-2026-08/) §4.2

## Context

The product had no tooltip primitive. Icon-only commands leaned on the native `title` attribute,
which is hover-only: no mainstream browser shows it on keyboard focus, and touch has no hover at
all — so the six `ICON_ONLY` glyphs on the plan command deck (`Deck.tsx`) and any future icon-only
control named themselves to a mouse and to nobody else. `docs/TECH_DEBT.md` #131 filed the gap on
the deck; #204(a) refiled it for the object bar (and its premise — `zoom-to-selection` being
icon-only — had already lapsed by the time this ADR landed: ADR-0115 restored that label, which is
recorded in the row rather than stepped over). #116(3) had called adding a tooltip "an ADR-level
decision (CLAUDE.md §5)", which over-reads that section — §5's clause is about adding a _component
library_; a hand-rolled primitive is the house pattern (`menu.tsx`, `combobox.tsx`). What actually
makes it ADR-shaped is ADR-0105: a new shared primitive is a public contract.

The sequencing constraint was M-C: a tooltip is a positioned overlay, and landing it before the
clamp consolidation would have added a **third** viewport clamp — the defect class the same epic
was closing.

## Decision

`components/ui/tooltip.tsx` — a hand-rolled APG tooltip as a **hook** (`useTooltip`), not a
wrapper component, for `usePopoverPanel`'s stated reason: the trigger differs per consumer, and a
wrapper needs `cloneElement` and a ref it cannot type.

**The load-bearing option is `purpose`, and it has no default.**

| `purpose`       | ARIA wiring                                                  | For                                                                                                                                                           |
| --------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'name-echo'`   | panel `aria-hidden`, **no** `aria-describedby`               | content restates the control's accessible name (the icon-only case). Linking it would make a screen reader say "Zoom in, Zoom in" — a VISUAL affordance only. |
| `'description'` | panel `role="tooltip"`, `aria-describedby`-linked while open | content carries something the name does not.                                                                                                                  |

A default would let the double-announcement failure be reached by omission, so the caller states
which case they are in and the compiler enforces it.

**WCAG 1.4.13 in full, each clause a test verified red against a broken variant:**

- **Dismissible** — Escape, claimed **only while open**, focus unmoved, and via `preventDefault()`
  **alone**: that suppresses a modal `<dialog>`'s default close (#196a) and is what
  `defaultPrevented`-deferring ladder rungs read. `stopPropagation()` is deliberately absent —
  **the first draft had it, and the pre-merge accessibility review blocked on it**: a tooltip arms
  from an incidental hover or focus, so a document-capture `stopPropagation` pre-empted every
  window/React Escape consumer (disarming a canvas tool, clearing a marquee) whenever a bubble
  happened to be open — the ADR-0064/ADR-0079 class, reproduced by resting the pointer on a glyph
  with a tool armed. An ambient overlay must yield: one press closes the tooltip AND still reaches
  the rung it was aimed at, pinned by a ladder-interplay test verified red against the
  `stopPropagation` version.
- **Hoverable** — the pointer may cross onto the tooltip; leave closes after a 150 ms grace.
- **Persistent** — no auto-dismiss timer exists.

**The interaction grammar:** hover opens after 400 ms (a row must not flicker as a pointer crosses
it); focus opens immediately (focus is deliberate — a delay there is user-hostile; it also opens on
a plain click's focus, a conscious call the review raised and this ADR accepts — it matches common
tooltip behaviour and blur clears it); a **touch long-press** (500 ms, cancelled by > 8 px of
movement or an early lift) opens the tooltip **without firing the command**, the following click
swallowed in `onClickCapture` — a tap that both fires and explains is noise (#131). A press outside
trigger and tip dismisses (touch has no Escape); a **pen takes the hover path only**, because pen
in both paths opened a 400–500 ms window where the name showed AND the command fired (review
finding 4). At most one tooltip is open application-wide (a module-level token with stable
per-instance handles). Positioned by the one clamp and portalled by the one target
(`overlay-position.ts`, fix-slice M-C). No transition, so `prefers-reduced-motion` is satisfied by
construction.

**Adoption (M-B):** `ToolbarButton`'s icon-only branch (`showLabel` falsy) drops its `title` and
speaks the **character-identical** string through the tooltip (`label`, or
`` `${label} — ${disabledReason}` ``). `purpose` is **derived, not hardcoded** (review finding 2):
`'name-echo'` ordinarily — AT hears nothing new (the name is `aria-label`-pinned, the reason
`aria-describedby`-linked, both unchanged) and nothing twice — but an icon-only control carrying a
live `description` says more than its name, and pre-M-B that text reached AT through the
title→accessible-description mapping, so it takes `'description'` and keeps that channel. The
labelled branch keeps its native `title`. `UndoRedoControl` — a bespoke `render` control the spec's
own table wrongly listed as going through `ToolbarButton`, caught by the journey's first run —
adopts the primitive too, keeping its dynamic accessible name.

**The discriminator for future `title` uses** (spec §4.2's table, now the authoring rule in
`docs/DESIGN_SYSTEM.md`): truncation affordances keep native `title` (free, correct, not a name);
labelled controls keep theirs (visible name); explanatory glyphs are `'description'` candidates in
a follow-on with their own review; shaded-reason visibility on labelled controls is #116(3) and
stays filed (CQ-2 declined — it changes ADR-0082's rule product-wide).

## Consequences

- Every icon-only command on the deck names itself to pointer, keyboard **and** touch; the
  flag-on-equivalent journey (`e2e-toolbar`) drives all three in a real browser, long-press
  included, and was verified red against the `title`-only button.
- The primitive's keyboard model went through `accessibility-reviewer` and `component-reviewer`
  **before merge** (CLAUDE.md §19.13 / ADR-0111 — the class shipped twice in two days once).
- `#131` and `#204(a)` close; `#116(3)`'s over-read is corrected in the register.
- A second consumer must choose a `purpose`; a third clamp cannot appear
  (`overlay-position.structural.test.ts`).
