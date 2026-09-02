# ADR-0122: A picture a screen reader cannot reach is not described by saying it is

- **Status:** Accepted
- **Date:** 2026-09-02
- **Deciders:** web
- **Amends:** ADR-0063 §7 (which states something false — see §1)
- **Builds on:** ADR-0026 D7/D8, ADR-0038, ADR-0055, ADR-0059, ADR-0063
- **Register row:** `docs/TECH_DEBT.md` #232

## Context

The TSLD's pinned WBS band (ADR-0063) paints one bar per work-breakdown grouping across the top of
the diagram, and its last bar is the derived **Unassigned** bucket — the work in this plan filed
under no summary. The band canvas is `aria-hidden="true"`, so a screen-reader user reaches it
through a text equivalent or not at all.

**There was no text equivalent, and two places in the repository said there was.**

- `TsldCanvas.tsx`, on the band canvas: _"its a11y equivalent is the band group in the parallel DOM
  listbox."_
- ADR-0063 §7: _"It carries no activity id, so it **is announced as a group** and cannot be
  selected."_

Neither is true, and the reason nobody noticed is the same for both: **each is right about half its
subject.** A real `WBS_SUMMARY` is an ordinary activity, so it already has a row in the parallel
listbox, and ADR-0063 §4 deliberately keeps it there when the band lifts it out of the scene. The
**bucket** has no activity id — it is not in the database at all — so it structurally cannot be an
option in a listbox built from activities. The claim was accurate for the groups that had another
route and false for the one that did not.

The Gantt does the same job properly and its comment says why: the count is _"part of the accessible
name, not a decoration beside it: 'Unassigned' alone does not say whether the row is worth
expanding."_ So the net effect was that a screen-reader user learned a plan had unfiled work in the
Gantt view and not in the diagram view of the same plan — the diagram being the surface this product
exists to be.

Found independently by the accessibility and UX reviews of `#71`, neither of which was asked about
it.

## Decision

### 1. ADR-0063 §7's second clause is withdrawn as a statement of fact

The bucket was **not** announced as a group. It is now, and that is what makes the clause true
rather than the clause having been true. ADR-0063's accepted text is not edited (ADRs are
superseded, never rewritten); this entry is where a reader who trusted it finds out.

Its first clause — that the bucket **cannot be selected** — was and remains correct, and nothing
here makes the band's text equivalent operable.

### 2. The equivalent is a non-focusable `sr-only` list, inside the diagram region and before the listbox

Not part of the listbox, and not focusable. A band group is not a bar: ADR-0026 D7's parallel-DOM
precedent is about the only route an AT user has to a **selectable object**, and there is nothing
here to select. Making these `option`s would invent an interaction ADR-0063 §7 refuses, and would
put non-activities into the set ADR-0063 §4's invariant counts.

The shape's real precedent is the **data-date paragraph** beside the same listbox — a standing,
non-live, non-focusable fact. It is placed **inside** `<section aria-label="Time-scaled logic
diagram">` because a landmark-navigating reader lands inside the region and never passes a
preceding sibling; that is the ADR-0073 C2.5 finding, already recorded one element along.

It is **not** `aria-describedby`-linked the way the data-date paragraph is, and the difference
matters: a description is flattened to a string, which would destroy the level structure below.

### 3. `role="list"` and `role="listitem"` are explicit

Tailwind v4's Preflight sets `list-style: none` on every `ul`, which is a documented cause of
WebKit/VoiceOver dropping the implicit `list`/`listitem` roles. `role="list"` had **zero**
occurrences in `apps/web/src`, so no precedent here compensates for it. The tests assert the role
rather than the tag, because a DOM-shape assertion passes in a browser where the semantics have
gone.

### 4. A group's count is its whole subtree, and the rows carry their parent so the counts cannot be summed

A phase's size is the work inside it, not how many boxes it was split into at the first level. So a
summary's count is every descendant at any depth, nested summaries included.

That decision has a consequence which is the reason for the second half of this one: **the counts
are not additive across nesting.** "Structure, 30 activities" containing "Substructure, 10
activities" describes 30, not 40 — and a reader given a flat list of names and numbers will add
them. So each row carries its resolved parent, the description is emitted in **depth-first tree
order**, and each item states `aria-level`, mirroring `GanttPanel`'s treatment of the same
hierarchy. Without that, the count decision would have made the surface actively misleading rather
than merely incomplete (WCAG 1.3.1).

The re-ordering is done on a **copy**. `wbsBandGroups` sorts by depth and `Array.prototype.sort` is
stable, so its order is breadth-by-level; the painter is fine with that (`wbsBandBars` derives a
row's y from the set of depths present, not from array order) and a reader is not. Changing the
shared sort to suit the description would silently re-order the band's paint for a text feature.

### 5. Nothing is announced when the band is toggled

No live region. The toggle is a checkbox-style menu item that announces its own state, both sibling
facts on this surface (the data date, the mode band) are deliberately pinned not-live, and WCAG
4.1.3 does not require it: its subject is the outcome of an action that would otherwise go
unnoticed, not a settings toggle whose control already speaks and whose consequence sits in reading
order where a sighted user finds it by looking.

### 6. Nothing visible changes

No count is drawn on the canvas. Sighted users see exactly what they saw; `#71` already shipped
their remedy for the bucket (an unfilled bracket rather than a colour), which is what left this
audience as the only one still relying on a claim that was never built.

## Consequences

- The diagram and the Gantt now name a group from **one composer**, so they cannot drift into
  describing the same grouping two ways — a difference only somebody who opened one plan in both
  views would ever see.
- ADR-0063 §4's invariant is **structurally** safe rather than observed to hold: its two assertions
  key on `getAllByRole('option')`, and a `listitem` cannot enter that set. Both were left unedited
  through this change, which is the point — an invariant you have to touch to make room for your
  feature was never an invariant.
- `WbsBandGroupInput` gains `count` and `parentId` and now differs from the render tier's
  structurally identical `WbsBandGroup`. That is intended and stated in both docblocks: neither
  field is geometry.
- **The counts are non-additive and that is a standing trap.** The obvious later "fix" is to make a
  summary count its direct children. The field's docblock says why that looks right and is wrong.
- **What is not covered:** the guest share view (ADR-0051) has no WBS band toggle, so it is out of
  scope structurally rather than by decision. Real AT announcement was reasoned from specification
  and the ARIA 1.2 `listitem`/`aria-level` contract, not observed with a screen reader — the same
  caveat ADR-0083 records, and the same honest label.

**The CPM engine is not imported and no migration runs**, so the ADR-0034 recalculation parity gate
is untouched by construction.
