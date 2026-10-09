# ADR-0183: A row grows with the finger it holds, and the Gantt is the named exception

- **Status:** Accepted — 2026-10-09, with the close-out of the `dense-row-touch-targets` feature spec,
  which the product owner approved 2026-10-08 with all three recommendations (CQ-1 the Gantt stays
  28 px; CQ-2 the activities table's `⋯` grows to 44 px on touch; CQ-3 `pointer`, not `any-pointer`,
  stays the gate). Built as milestones M0 to M3 (#901, #903, and M3 in review at the time of writing).
- **Spec:** [`docs/specs/dense-row-touch-targets/feature-spec.md`](../specs/dense-row-touch-targets/feature-spec.md)
  · **Plan:** [`implementation-plan.md`](../specs/dense-row-touch-targets/implementation-plan.md)
  · **Readings:** [`m0-measurement.md`](../specs/dense-row-touch-targets/m0-measurement.md)
  (predictions committed first in [`m0-falsification.md`](../specs/dense-row-touch-targets/m0-falsification.md))
- **Date:** 2026-10-09
- **Deciders:** James Ewbank (product owner) and Claude Code.
- **Amends:** ADR-0118 — D1's coarse exception list keeps `icon-sm` for one consumer only (the
  Gantt's `⋯`), and D8's blind spot (a control overflowing its container) gains a containment
  assertion for row-menu triggers.
- **Builds on:** ADR-0177 D4 (the Gantt's exceptions, unchanged and cited here), ADR-0118 D1 and D7,
  ADR-0088 D1 (no flag), ADR-0105 (why this needed a spec), ADR-0110 (a gate is planted red),
  ADR-0111 (keyboard and focus contracts), ADR-0113 (measure the problem first), ADR-0179 (the
  1024 × 600 floor).

## Context

`docs/TECH_DEBT.md` #215 said the small `⋯` buttons in dense rows stay 28 px under a finger because
their rows are fixed in JavaScript. Re-read against the tree, that was true for three of the five
`icon-sm` call sites (the Explorer tree, the Gantt, the collapsed spine). The other two reach seven
tables whose rows are content-sized and already about 61 px on touch: the shared `RowActionsMenu`
(Clients, Projects, Plans, Resources, both Calendars tables) and the activities table.

A 44 px hit area cannot fit in a 28 px absolutely-positioned row without taking taps from the row
above: the 8 px that reaches up paints over its neighbour. So in a fixed row the honest choices are
to grow the row or to keep a named exception.

**Two bars, kept apart.** 28 px already passes WCAG 2.2 §2.5.8 Target Size (Minimum), level AA, whose
floor is 24 px. The 44 px figure is the house rule (ADR-0118 D1; §2.5.5, level AAA). Everything below
is about the house rule. No decision here relaxes AA.

## Decision

**D1 — Under a coarse pointer a target is 44 px, unless a density-critical surface has device
evidence that its smaller targets are hit.** The exception is to the 44 px **house rule**, never to
AA. The Gantt qualifies: it is the surface read all day, and on the product owner's Surface the 28 px
`⋯` and the 24 px summary arrow scored **0 misses out of 10** in both postures
([`device-results.md`](../specs/gantt-coarse-pointer/device-results.md)). The tree does not qualify:
it is a navigator and its row is the navigation target. The tables do not need the exception, because
they have the room.

**D2 — Two variants, and which one a target takes.** A target in a row that **grows** with it is
`Button size="icon-row"` (`size-7 pointer-coarse:size-(--control-h)`). A target in a container of
**fixed** size is `size="icon-sm"` and must be on ADR-0118 D1's list with its equivalent. Today
`icon-sm` has exactly one consumer, `GanttRowMenu`; a structural test counts the call sites so a
second one fails the build.

**D3 — The gate is `pointer: coarse`, not `any-pointer`.** The JS side of the axis is
`useCoarsePointer()` and nothing else (one exported query constant, `COARSE_POINTER_QUERY`), used only
where a number is needed before layout, and it is a geometry remedy, which ADR-0177 D1 allows. A
structural test pins that no other string mentioning `pointer` reaches `matchMedia` or `useMediaQuery`.
**Known gap, recorded rather than fixed:** with the keyboard cover attached the Surface reports
`pointer: fine` (ADR-0118 D7), so a finger used in that posture meets 28 px targets everywhere,
including the collapsed spine and the tree. `any-pointer: coarse` would close it, but it would also
change the 36 px deck and enlarge targets for a mouse plugged into the same device, so it is a
product-wide decision rather than this one, and it was declined (CQ-3).

**D4 — Explorer tree, activities and list rows, and the spine.**

- Tree rows are 44 px under a coarse pointer (`treeRowHeight(coarse)`, pinned to `--control-h` by a
  structural test), with the name, the row and the `⋯` all full-size targets.
- The six `RowActionsMenu` tables take `icon-row` at no cost in rows: the row is already 61 px.
- The activities table takes `icon-row` (CQ-2): rows with a `⋯` go 45 to 61 at 1912 wide and 57 to 61
  at 1024 wide, where the row is already width-keyed.
- The collapsed Explorer spine sizes from its controls (44 px links plus the wrapper's `p-1` and the
  border): 53 px on touch.
- **The fine spine overflowed before this ADR, and that was a defect, not a premise.** At 34 px its
  36 px links spilled out of the box (`scrollWidth` 39 against `clientWidth` 33). The fix is 45 px
  with a mouse, which costs a mouse user 11 px of plan width when the Explorer is folded. The
  changeset says so.

**D5 — A pointer change re-anchors the tree.** Folding or unfolding the cover flips the pointer under
a scrolled, focused tree. The contract is that the same row stays first in view and focus stays on
the same item.

- A **ref-captured anchor** `{ index, intraOffset, height }` is updated on every scroll event and
  every render, because when the pointer goes coarse to fine the content shrinks and the browser
  clamps `scrollTop` during layout, before any effect could read it.
- A layout effect keyed on the row height calls `virtualizer.measure()` (the virtualizer caches sizes
  and keys its measurements on that cache, not on `estimateSize`, so pinned rows would otherwise keep
  the old height) and **stashes** the target offset. It does not call `scrollToOffset` itself: in
  that commit the sizer is stale, `scrollToOffset` clamps to the old `scrollHeight`, and fine to
  coarse past about 60 % of the list would land on the wrong rows. A second layout effect, declared
  before it so it only sees a target stashed by an earlier commit, applies the offset on the re-render
  `measure()` causes. The early return on an unchanged height makes both a no-op on first mount and
  under StrictMode.
- The accessibility review (B1) found the stale-sizer case; the real-virtualizer unit tests pin it.
- Focus survives because `rangeExtractor` (extracted as a pure helper) pins the active, selected and
  menu rows. No journey can prove the flip: Playwright's `emulateMedia` has no `pointer` option and
  `hasTouch` is fixed per context, so the posture change is covered by unit tests and the device
  sheet, and no journey claims otherwise.

**D6 — The Gantt stays 28 px under both pointers.** ADR-0177 D4's entries (the `⋯`, with press-and-hold
on the row as its equivalent, and the summary arrow, with ArrowRight and ArrowLeft) stand and are
exempted from the coarse projection by name, never by size. **Revisit trigger:** any device reading
with **more than 1 miss in 10** on the Gantt's row menu or arrow, or a request from the product owner.
Growing them would cost about 36 % of the Gantt's rows and reopen the bar, cell and link geometry, and
would be its own epic.

**D7 — The gates.**

- The coarse sweep covers every surface that carries `icon-row`: the Explorer (the tree is no longer
  in `EXEMPT_WITHIN`), the activities table, the Clients list and the collapsed spine.
- A containment assertion: every `[aria-haspopup="menu"]` inside a `[role="treeitem"]` or `tr` has its
  box within its row's box, to 0.5 px. It is the narrow form of the instrument ADR-0118 D8 found
  missing, scoped to one selector so its false positives stay few, and it was planted red first.
- The activities table's row checkboxes (24 px labels around 16 px boxes) are excused by a named
  marker, `data-coarse-exempt="row-select"`. They pass AA and are filed as `docs/TECH_DEBT.md` #470.

## Costs measured in M0

Container Chromium, layout only (ADR-0128): the figures below are emulation, and the device sheet is
the arbiter. They replace the spec's worked-out figures (ADR-0113).

- **Tree rows fully in view:** 20 to 12 at 1912 × 1104 (**-40 %**) and 4 to 2 at 1024 × 600
  (**-50 %**). The continuous figure is 36 % (1 - 28/44); whole-row flooring makes the real loss 40 %
  and 50 %. The spec said the floor paid nothing ("about 0 rows"); the tree is in fact 128 px high
  there and shows 4.
- **Activities rows:** 45 to 61 at 1912 wide (3 rows become 2 in the same 172 px scroller); 57 to 61
  at 1024 wide. No activities row is hit-testable at the floor today, before or after.
- **List rows:** 60.5 / 61 on touch, 48.5 / 49 with a mouse. Unchanged.
- **Spine:** fine 34 to 45, coarse 34 to 53. "Show Project Explorer" was 28 px on touch, so US-3
  was false for it as well as for the links.
- **The accepted truncation.** At the Explorer's 200 px minimum a level-3 plan name keeps about
  54 px, roughly eight characters, beside the always-visible 44 px `⋯` (200 less the 48 px indent,
  the chevron, the icon and the button). No `title` is added: a hover tooltip does nothing on touch,
  the posture this costs. The full name stays reachable two ways: the row's accessible name,
  "Actions for <name>" on the `⋯`, and the plan's own detail page. The Explorer can also be widened.

## Alternatives considered

- **44 px rows for everyone.** Costs mouse users 36 to 40 % of the tree and Gantt rows for no gain.
- **A 44 px hit area on a 28 px visual in the tree or the Gantt.** Geometrically impossible without
  taking taps from the row above.
- **A hit box (`-my-2`) in the activities table.** Valid and free in rows, but a per-site
  negative-margin construction at the scroller's edge; offered as CQ-2's alternative and declined.
- **Grow the activities checkbox now.** A second control outside #215; filed as #470.
- **`any-pointer: coarse`.** See D3.
- **Grow the Gantt too.** See D6.
- **Keep everything as an exception.** Leaves seven tables below the house rule with no equivalent
  and no gate.

## Consequences

- On a mouse nothing changes except the spine: 34 to 45 px, a defect fix, 11 px of plan width when
  the Explorer is folded.
- A planner on touch sees 40 % fewer tree rows at 1912 × 1104 and 26 % fewer activities rows, and
  gets 44 px targets for them.
- A finger with the cover attached stays at 28 px (D3), and a one-frame mismatch is possible on a
  fold: the `⋯` resizes in CSS at once and the tree's JS row height follows one render later.
- Coarse to fine at the very end of the list: the browser clamps the restored offset, so the end of
  the list stays in view, which is expected.
- The device sheet (`docs/specs/gantt-coarse-pointer/device-checklist.md`, items 13 to 24) carries
  what no journey can: the posture flip, focus kept through it, and the 1024 × 600 activities row.

## References

- `docs/TECH_DEBT.md` #215 (closed by this ADR's spec), #470 (row checkboxes, open), Closed numbers.
- `docs/specs/dense-row-touch-targets/m0-measurement.md` §1 to §6.
- `apps/web/src/features/navigator/components/HierarchyTree.tsx`,
  `apps/web/src/components/ui/button.tsx`, `apps/web/src/components/ui/use-coarse-pointer.ts`.
