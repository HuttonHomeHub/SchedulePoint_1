# ADR-0115: A bound governs what it encloses, and the wrap was measured from one state

- **Status:** Accepted
- **Date:** 2026-08-27
- **Deciders:** Product owner; ux-reviewer, accessibility-reviewer, component-reviewer,
  ui-architect, performance-reviewer

## Context

The product owner sent three screenshots of the plan workspace and eight observations. Three were
defects and shipped as `web-v0.108.2`. The other five were questions about **layout** — should the
foot row match the bands above it, should its two halves swap, could the plan's facts take two
lines at the same height, should the object bar always be visible with its buttons shaded, and
could commands come out of the `▾` menus now there is room.

This repository's record on answering layout questions from a drawing is bad. **Six consecutive
epics — ADR-0090 D3, ADR-0091 D4, ADR-0092 M5, ADR-0093, ADR-0113 and ADR-0114 M2 — had their width
expectation contradicted by their own measurement**, and ADR-0090's first recorded consequence is
that it was wrong three times for having been drafted without a shell. So nothing was specified
until it was counted, in a real Chromium driving the real product at 1920, 1646 (the product
owner's Surface Pro at 175%) and 1440.

**The measurement's headline was not one of the five.** Selecting a single activity made the foot
row wrap: the object bar needs 1037.4 px and is given 775.6 px at 1646, so the canvas lost **36 px
at 1646 and 76 px at 1440** every time a planner clicked a bar. That is ADR-0114 M1's own
consequence followed one step further than that ADR followed it — `shrink-0` → `min-w-0` stopped
clipping four unreachable controls and started eating the diagram, and the abstract loss of
ADR-0092's 0 px dock guarantee was recorded while the number never was.

## Decision

**D1 — The wrap is fixed on the object bar, not by moving work to the deck.** `Clear visual start`
is **omitted** outside Visual mode rather than shaded, and `Zoom to selection` was made icon-only.
Both stay where they are.

**`Zoom to selection` then got its label back, and that round trip is the clearest instance of this
ADR's own rule.** M1 chose icon-only against a 775.6 px container; **D5 then widened that container
by 231 px and nobody re-asked**. The architecture review caught it — ADR-0113's rule (re-verify the
_problem_, not only the design) failing _inside_ one epic, between two of its own milestones.
Re-measured with the label restored: **41 px in both states at 1920 and 1646**, the two widths the
product owner uses, and **77 px at 1440 with a selection**. Put to them with that number, they chose
the label. So the object bar's own rule — every item carries its name, because on a bar of nine
commands the name _is_ the affordance — survives intact, and `Deck.tsx`'s `ICON_ONLY` set stays what
it is: glyphs a stranger cannot guess wrong, which a crosshair is not.

Omission is ADR-0082's own discriminator rather than a width convenience: a plan scheduled Early
has no hand-placed start anywhere in it, so the action does not _apply_ — there is nothing for a
reason sentence to say beyond "this does not exist here", and it was holding 146 px of a wrapping
row to say it. The applicability test is a separate exported predicate that the existing gate
calls, so `schedulingMode` is still read in one place; a third field on the gate's return was
rejected because `BulkActionGate` is shared with the plural bar, where "applicable" is meaningless
for `link` and `remove`.

**Measured, both halves are necessary and neither is sufficient.** Candidates were applied by
hiding the real controls in the real row rather than by adding up widths: omitting the shaded
control alone leaves the bar wrapped at 1646 (819.4 px of items against 775.6 px available), and
moving two controls while keeping it wraps too. Only both together reach one line.

**D2 — The approved shape was withdrawn on its own measurement.** The product owner approved moving
`Zoom to selection` and `Isolate` onto the command deck, on the argument — correct in itself — that
their subject is the viewport rather than the activity (ADR-0093's rule). Measured, the deck goes
from two lines to three at 1646: **58 px of canvas to save 36**. A net loss at the width the epic
exists to serve. **Seventh consecutive contradicted width expectation, and the first where the
arithmetic was right and the model was wrong** — a wrapping row breaks between _items_, so freed
width need not buy a line.

The stated reason for the original placement is also recorded, because a review reported it
differently and the code says otherwise: `tsld-toolbar-items.tsx` says those commands moved off Row
1 because "all three spent most of their life on Row 1 shaded — holding width to say _Select an
activity first_". That is an objection about shaded controls holding width, not about a pinned
floor, and ADR-0109 D1 did not delete it — it only removed the rationing at widths where the deck
now has slack.

**D3 — The foot row joins the `chrome` surface scope.** The complaint was that it should be "the
same colour as the others"; measured, it had **no surface scope at all** — `(page)`, a transparent
background and one 1 px grey border — while the header and deck are a `<Surface tone="chrome">`
navy card. Not two shades of one treatment: one was a card and the other a hairline.

A scope rather than a card, and that is the whole reason it is affordable: `Surface` contributes a
background, a foreground and a `data-surface` attribute and **no geometry**, so every token inside
rebinds while the box model is untouched. The band's 10 px radius and 3 px amber bottom edge are
deliberately **not** copied — those are geometry, and this row's value is that it takes none.
Measured 41 px at rest at all three widths, before and after.

**D4 — Object actions lead; the plan's facts trail.** ADR-0114 chose the opposite three days
earlier on the stated ground that a leading dock would slide the facts sideways whenever a selection
appeared. **That claim does not hold against the code it describes**: the dock is `flex-1
basis-0%`, so its width is content-independent, and the facts are `shrink-0` with `basis: auto`. At
either end neither region moves. ADR-0076 Class 3, in a document three days old, corrected at the
docblock rather than repeated.

The order now rests on the argument that survives: the object bar gets a **fixed leading edge**,
where before every button in it shifted by however wide the facts happened to be — and the facts'
width varies by over 100 px between states.

**D5 — The facts wrap to two lines at zero row-gap, and the bound governs the facts alone.** The
product owner asked for "two lines keeping the same height of the toolbar still" and the answer is
yes, at no cost: the whole price was one character, because `gap-4` sets a 16 px **row** gap as well
as a column gap. A wrapped row measured 64 px and grew the foot to 65; at `row-gap: 0` two 16 px
lines are 32 px, under the 40 px collapse button that already sets the floor.

**The bound is on a wrapper around the facts, not on the row, and the first version got that
wrong.** `max-w-64` sat on the container that also holds `ScheduleStateRegion` and
`PenStatusOutlet`, and every measurement behind the milestone ran after a recalculation — the one
state where the schedule region renders **nothing**. So the readings never contained two of the
row's five content sources. Two independent reviews caught it and the browser settled it: injecting
the real stale sentence and its Recalculate button took the facts to three lines and the row from
**41 px to 53 px at every width**, with no selection at all. That is a strictly worse version of the
defect this epic exists to close — ADR-0114's wrap needed a click; this needed only an uncalculated
edit.

Bounded correctly it also **finishes what D1 could not**: handing 231 px back to the dock takes
1440 from 117 px to 41 px and the canvas from 484 to 560 — the entire loss recovered. 300 px was
measured too and only reaches 77, so the bound does real work rather than being a round number.

**D6 — `Edit plan` is offered once.** It was rendered twice from one `editPlan` memo — the header's
pencil and a labelled shortcut in the `Summary ▾` popover — with the same gate, the same effect and
the same subject. ADR-0093's rule verbatim, and its structural gate **cannot see it**, because that
compares the two registries and neither copy is a registry item. The product owner chose the pencil.

**D7 — One lens toggle is promoted, and two of the three named could not be.** `Baseline overlay`
moves out of `View ▾` onto the deck. Measured: two deck lines at 1920 and 1646 with the canvas
unchanged, three at 1440 costing 58 px — the risk the product owner accepted.

`Float paths` is **already** a deck item and `Critical path` is not a lens toggle at all. Both came
from options this author wrote from memory rather than from `LENS_TOGGLES` — ADR-0076 Class 3 one
step upstream of a document, in a choice put to somebody else. Recorded as `docs/TECH_DEBT.md`
#204(d) because §19.11's rule is about claims in documents and nothing covers a claim in a
question.

**D8 — Always-visible-and-shaded is declined.** It makes D1's cost permanent — 36 px at 1646 and
76 px at 1440 whether or not anything is selected — and collides with ADR-0082, whose own clause
says a surface every item of which would be shaded renders no trigger at all. With nothing selected
there is no object, so ten controls would be shaded against a subject that does not exist.

**D9 — No `VITE_` flag.** ADR-0088 D1: a `VITE_` constant is inlined at build time and has never
been an operator rollback. The rollback is a commit boundary, and each milestone is one revertible
commit.

## Alternatives considered

- **Move the two viewport commands to the deck** (D2) — approved, then withdrawn on measurement.
- **Widen the facts' bound** rather than re-scope it — treats the symptom; the schedule state and
  the pen sentence are not facts and had no business inside a bound built for facts.
- **Let the facts shrink** so they wrap under pressure — measured and it changes **nothing** at any
  width, because the dock beside them is `flex-1` and absorbs the whole deficit by wrapping its own
  items. The facts are never squeezed whatever their shrink factor.
- **Give the foot row the band's radius and amber rule** — costed at +2 px and rejected; the row's
  value is that it takes no height.
- **A ratio ceiling / a second contrast gate for the new scope** — the matrix is scope-generic and
  already covers every pair the row paints (260 assertions, verified by running it).

## Consequences

- The foot row is **41 px in both states at 1920 and 1646**, and 41 px at rest at 1440 with a
  selection costing 36 px there (the label's price, chosen deliberately — D1).
- **At 1440 this epic is a net LOSS at rest, and that is stated here rather than left in two
  paragraphs that each read as a win.** D7's promotion costs 58 px at that width whether or not
  anything is selected; D1 and D5 win 76 px there only _while something is selected_. Netted
  against the pre-epic measurements: **1440 at rest 560 → 502 px of canvas (−58)**, 1440 selected
  484 → 466 (−18 with the label restored). 1920 and 1646 are unaffected by D7 and improved by
  D1/D5. The architecture review found this by netting two measurements nobody had put side by
  side; the product owner was shown the figures and kept the promotion, because neither of their
  machines is 1440.
- **`docs/TECH_DEBT.md` #124's premise changes**: that row says the selection bar cannot overflow.
  It could, it did, and it now does not — but the reason is the two omissions, not a structural
  guarantee. A tenth item would re-open it.
- The object bar is nine items; the deck is two lines at 1920 and 1646 and three at 1440.
- **The measurement estate grew by ten harness files** in `apps/web/measure-toolbar/`. They are
  harnesses, not gates, and are not run in CI (ADR-0081 §3). The architecture review was asked
  whether that estate is now a liability.
- Four findings are recorded rather than fixed: `docs/TECH_DEBT.md` #204.
- **The CPM engine is not imported and no migration runs**, so the ADR-0034 recalculation parity
  gate is untouched by construction.

## What this ADR got wrong on the way

Kept because the corrections are the useful part.

1. **"Two-line facts are never free."** M0 concluded that from measuring today's `gap-4` and
   generalising it into a property of the layout. It is one Tailwind class. The design review
   caught it; the browser confirmed it.
2. **"`You're editing this plan.` is 125.9 px of the facts."** It is a phantom — the element is
   inside an ancestor clipped to 1 × 1 and painted only when the pen is lost or requested. The
   probe measured the inner span through the clip. A milestone removing it "for width" would have
   freed zero.
3. **"`docs/TECH_DEBT.md` #202 and #203 do not exist."** They do. The register writes modern rows as
   `## 202.` and older ones as `## #201 —`; a grep for `^## #` found neither, and the `git show`
   used to "confirm" it shared the same defect. Both reviewing agents reported the same absence,
   which is why it read as corroborated. Three readers agreeing does not make a pattern correct.
4. **"The deck's slack is the constraint on promotion."** The count was right and the inference was
   wrong: 35 of the 48 controls behind the `▾` triggers are switches, radios and a date input, and
   nine of the remaining thirteen are one export family. There is room and almost nothing to put
   in it.
5. **Six instrument defects**, each recorded where it happened rather than tidied away — a document
   sweep that read the canvas's a11y listbox as menu content, an added-elements probe blind to
   `role="dialog"` panels, a diagnostic that folded the card it meant to open, a what-if capping a
   wrapper while the row inside it overflowed, a selection gesture that selected nothing, and a
   `lines` column that counted item rows while the bar's own label wrapped beside them.
