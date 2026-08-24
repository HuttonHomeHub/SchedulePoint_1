# Plan workspace redesign — "Drafting Table"

This directory holds the approved design and the work that implements it.

## The rulebook is suspended for this epic

The product owner instructed, on 2026-08-24, that the ADR register and existing standards
are set aside for this redesign, and that **the standards are rewritten afterwards** as a
reconciliation pass derived from what actually ships — rather than the design being bent to
fit rules written for the thing being replaced.

That is deliberate and it is bounded. The only hard constraint is that **the CPM engine, the
REST API and the database are untouched**: this is `apps/web` only, which is what makes the
whole redesign revertible by one commit.

Do not read this directory as a precedent for ignoring `docs/PROCESS.md`. It is a
product-owner decision for one epic, with an explicit obligation to write the replacement
standards at the end of it.

## Why it exists

Four restyles had already been attempted (ADR-0097 Landing, ADR-0099 Graphite, ADR-0101,
ADR-0102) and the product owner's verdict on the result was that it still looked poor. The
diagnosis that finally stuck came from reading the **old Flask app** rather than describing
it from memory:

- Its toolbar **wrapped** — `flex-wrap: wrap` over five labelled group cards holding fifteen
  buttons. It had no overflow menu because it never needed one. The current app registers
  ~46 commands and four consecutive epics tried to fit them into one or two fixed-height
  rows, which is where the `⋯` came from.
- Its chrome was **navy cards floating on a gradient**. The current app kept navy in the top
  bar only, so everything below it was white on white on white with no card edges and the
  amber never appeared. The palette was not wrong; the surfaces had gone.

## The approved design

[`approved-mockup.html`](approved-mockup.html) is not a picture — it is working HTML and CSS
at 1646 px (the product owner's Surface Pro width) with a complete token block, a draggable
Explorer divider and a live gauge. It is the authoritative reference for palette, geometry
and behaviour.

Three passes were reviewed. The eight decisions it embodies:

1. **Stacked buttons** — icon above a 9.5 px label. Labels are suppressed only where the
   icon is genuinely universal (zoom ±, fit, undo, redo, print).
2. **Project Explorer docked left**, collapsible to a 34 px spine and resizable 200–420 px,
   both persisted.
3. **Recalculate leaves the deck** — it appears in the status bar only when the plan is
   stale, naming the edit count, and is absent when the plan is current.
4. **Modes on the identity line** — Diagram|Gantt and Early|Visual beside the pen, because a
   mode is not a command.
5. **No overflow menu anywhere.** All 33 deck commands visible in four labelled groups that
   wrap and collapse.
6. **The left icon rail is deleted** — it was doing two unrelated jobs. Plan tools move into
   the deck; organisation destinations move behind the brand mark.
7. **Diagram**: no diagonal weekend hatch, no row striping, criticality separated by
   lightness as well as hue, real arrowheads on links.
8. **Replace in place, no `VITE_` flag.** A `VITE_` constant is inlined at build time and
   cannot be switched off on a deployed container, so a flag here would be a rollback
   contract that does not exist. The rollback is reverting the commit.

## Two decisions taken against my recommendation, recorded as such

- **The Explorer is docked rather than opened from the breadcrumb.** I argued the breadcrumb
  already names the hierarchy and costs no width at rest; the product owner chose the old
  app's permanent column. It is collapsible and resizable in consequence.
- **Row striping is removed.** Correct at five activities. The condition worth remembering is
  that striping is a tracking aid _at scale_ — on a 500-activity import at 60 lanes it is how
  you keep your place across five months. It returns as a `View ▸ Structure` toggle if wanted,
  which is the same mechanism swimlanes would use.
