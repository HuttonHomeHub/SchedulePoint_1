# ADR-0202: A loading state is the settled shape, and says one sentence

- **Status:** Accepted — 2026-10-17. The spec was approved by the product owner on 2026-10-17 with the recommended
  defaults (CQ-1: the seven text-only "Loading…" states become a new register row; CQ-2: the client and project
  tables load at once) and the conservative live-region contract (no real-screen-reader observation is owed). Built in
  milestones M0–M7; the post-build re-measurement of SC-2 and SC-3 is owed to a run of the instrument (see
  Consequences).
- **Spec:** [`docs/specs/loading-skeletons/spec.md`](../specs/loading-skeletons/spec.md) §4.9 · **Plan:**
  [`implementation-plan.md`](../specs/loading-skeletons/implementation-plan.md) · **Baseline:**
  [`m0-measurement.md`](../specs/loading-skeletons/m0-measurement.md)
- **Date:** 2026-10-17
- **Deciders:** James Ewbank (product owner) and Claude Code.
- **Amends:** [ADR-0146](0146-a-page-has-one-measure-and-a-column-has-a-reason.md) D3 (the skeleton half: a `fit`
  column now applies to a sampled skeleton).
- **Builds on:** ADR-0086 (the staff gate stays generic), ADR-0088 D1 (no flag), ADR-0105 (why a spec), ADR-0142 (a
  remedy is measured before it is built), ADR-0145 (the archetypes), ADR-0178 D-6 (the console's one sentence).

## Context

`docs/TECH_DEBT.md` #234 counted first-load states that were a centred spinner where the settled shape was known, and
#341 recorded that a table skeleton's column widths did not match the settled table's. Re-reading the code for the spec
found 31 `<Spinner>` render sites and five different accessibility mechanisms, and six defects the row did not
list: five panels announced a generic "Loading…" beside the sentence they showed (a hyphenated `aria-hidden` on a
component that accepts none is dropped silently); the staff console announced six times; the guest view held two live
regions for one sentence; and two primitives put their status inside an `aria-busy` container.

The last of those is the one that decides the contract. ARIA 1.2 allows assistive technology to defer changes inside a
busy element until it is no longer busy, and a loading sentence is unmounted before that happens. That is reasoned from
the specification and **has not been observed with a screen reader**; the owner declined an observation, so the
contract is built so that no reading of the specification can defer the sentence.

The baseline (`m0-baseline.json`) was taken on an unmodified tree: of the eleven sites the harness reaches, nine fail
SC-2, four of five graded `fit` columns miss SC-3 by 160 px or more at 1646, and every site that had a status put it
inside an `aria-busy` subtree. Six site groups (the staff panels, earned value, the summary strip, the editor tabs, the
guest view and the invitation card) need a token, an account or an interaction the harness cannot supply and are
unbaselined.

## Decision

**D1 — The discriminator.** A first load whose settled shape is known for the **ordinary** outcome gets a skeleton. A
**gate** (the answer decides which layout renders at all, so there are two or more ordinary outcomes) and an
**action or computation** (a result the reader asked for, named by a visible verb) keep a `Spinner`. A gate whose
shape would disclose the surface stays generic: the staff identity check shows nothing console-shaped while pending,
because that would be the tell the uniform 404 forbids (ADR-0086).

**D2 — Material, content-shaped material, and shape.** `Skeleton` is the material and carries `data-skeleton`; its
`on: 'page' | 'muted'` variant names the ground it is drawn on. `SkeletonText` is content-shaped material: a block
the size of a caller-supplied sample string, the sample set as `visibility: hidden` text and never a transparent
colour, which forced colours would print. The **archetype or panel that knows the shape owns it** (`PageHeaderSkeleton`,
`StatGridSkeleton`, `KeyValueListSkeleton`, `ContextStripSkeleton`, `DataTableSkeleton`, `ListRowSkeleton`, and
feature-local `NoteItemSkeleton`, `HistoryEntrySkeleton`, the exception row and the members checklist), sharing its
archetype's layout classes as constants so the two cannot drift.

**D3 — One sentence, and never inside a busy subtree.** `LoadingShape` is the accessibility contract: the shape is
`aria-hidden` and holds nothing focusable; the sentence is a `role="status"` that mounts empty and is filled after mount
(a live region inserted already holding its text is commonly not announced), or `announce="none"` where an enclosing
region already speaks. The status is **never** inside an element carrying `aria-busy`, which makes the ARIA 1.2 deferral
irrelevant by construction. `LoadingShape` sets no `aria-busy` of its own; a persisting container that receives content
may carry one only where no status lives beneath it, and the sites here simply carry none. `Spinner`'s `label` is
required and carries no default copy; `labelOnScreen` draws the sentence from the first frame as an `aria-hidden` copy
while the announcement stays a separate status.

**D4 — A table is sized by a sample, not by a number.** `Column.sample` is one plausible value formatted by the
formatter the settled cell uses; `DataTableSkeleton` draws the real headings and, for a sampled column, a placeholder
as wide as the sample with the column's declared width classes, so a `fit` column starts at its settled width. The
skeleton table is `aria-hidden` and still emits no `data-col-width`. Remembering last-settled widths was rejected
because the only load that shows a skeleton is one with nothing to remember.

**D5 — Forced colours.** One unlayered rule outlines `[data-skeleton]` with `GrayText`: forced colours replace
backgrounds, so a bare skeleton was invisible.

**D6 — The gate.** `loading-states.structural.test.ts` declares every `<Spinner>` as a gate or an action (G1), refuses a
hand-rolled `animate-pulse` outside `Skeleton` (G2), refuses an `aria-hidden` on a `<Spinner>` (G3) and refuses a
`Spinner`, a speaking `LoadingShape`, `role="status"` or `aria-live` inside an `aria-busy` element, found by walking the
JSX tree (G4). `data-table.sample.structural.test.ts` walks the tree and requires every `fit` column to carry a
`sample` or its file to be declared unsampled with a reason, counted per column. Each `pending` bucket was a declaration
the epic had to empty; all three are empty.

**D7 — Loading says nothing about the subject.** The guest view and the invitation card render the same pending DOM for
every token, and carry a generic sentence, so loading is not an existence oracle (ADR-0051 §5). The client and project
screens render their frame at once and swap only the header; a subject that does not exist replaces the screen with the
not-found state, and the table's own request may fail first for the same reason (CQ-2).

## Alternatives considered

- **One generic `<PageSkeleton>`** (a title, some lines, a block) for every site. Rejected on `skeleton.tsx`'s own ground:
  a generic rectangle reflows into whatever arrives.
- **Bespoke skeletons with no shared contract.** The extract-on-the-third-time threshold was passed long ago and five
  hand-written accessibility mechanisms existed.
- **Fix #341 by freezing measured widths.** Impossible on a first load.
- **`aria-busy` on the persisting container with the status beside it** (the spec's first reading of D3). Replaced by the
  stricter rule above once the owner declined an observation: a sibling status is safe under every reading, a status
  below a busy ancestor is safe under only some, and the difference costs nothing.
- **A delay before any skeleton shows.** A separate decision with its own cost (a blank frame for N ms); not needed to
  meet SC-1 to SC-6.

## Consequences

- **Easier:** a new first load has one obvious shape to build and a gate that refuses the wrong one; a table's columns no
  longer slide when rows arrive; the console, the guest view and the invitation card speak one sentence.
- **Harder:** a skeleton cannot know a count or an optional field. A header with no description is drawn without that
  line, so a subject that has one grows by the line when it settles; a table grows by its rows. These are named at their
  sites rather than hidden.
- **Reasoned, not observed.** The ARIA 1.2 deferral that motivates D3 is from the specification, and the contract's
  claim to be safe is by construction. No screen reader was run.
- **Not yet re-measured.** The instrument (`apps/web/scripts/measure-loading-shapes.mjs`) needs a database and a browser;
  the post-build SC-2 and SC-3 figures are owed to a run of it, and until they are recorded the withdrawal clause for
  SC-3 (re-argue in writing if a sample cannot reach 8 px) has not been tested.
- **Debt recorded, not hidden** (`docs/TECH_DEBT.md`): seven first-load states that are plain text "Loading…"; the schedule
  health panel as a skeleton candidate (ADR-0116's fixed check set); and the members tab's `loading` and `error`
  props, which its only host never passes.
- **Two places still put a status inside a busy region, found by the accessibility review and fixed in this work.**
  `AuthShell`'s `busy` put `aria-busy` on the card around the forgot-password screen's `Spinner` (the first version of
  this ADR said nothing set it; `forgot-password.tsx` did), and `StatusSection` passed `busy` to the section that
  contained its own polite sentence. Both props are gone: `AuthShell`, `InviteShell` and `SectionCard` no longer have
  `busy`, and `StatusSection` marks a wrapper around its content only, its sentences being siblings. Gate G4 now treats a
  `busy` prop on those components as the attribute it used to forward, and `useLateStatus` logs an error in development
  and test when its node is inside an `aria-busy` element, which catches what a JSX scan cannot see.

## References

- `docs/TECH_DEBT.md` #234, #341 (closed by this work); `docs/specs/loading-skeletons/`
- `docs/DESIGN_SYSTEM.md` "Loading states"; `docs/COMPONENT_LIBRARY.md` "Primitives: loading"
- ADR-0051, ADR-0086, ADR-0088, ADR-0105, ADR-0116, ADR-0142, ADR-0145, ADR-0146, ADR-0178
