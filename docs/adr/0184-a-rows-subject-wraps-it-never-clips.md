# ADR-0184: A row's subject wraps; it never clips

- **Status:** Accepted — 2026-10-09. The spec was approved by the product owner on 2026-10-09, on the
  M0-T3 photographs: CQ-1 yes (readable rows over compact rows), CQ-2 yes (this ADR), CQ-3 yes (`ListRow`'s
  trailing text drops beneath the row's text when the row is very narrow).
- **Spec:** [`docs/specs/row-subject-truncation/feature-spec.md`](../specs/row-subject-truncation/feature-spec.md)
  · **Plan:** [`implementation-plan.md`](../specs/row-subject-truncation/implementation-plan.md)
  · **Readings:** [`m0-measurement.md`](../specs/row-subject-truncation/m0-measurement.md) (today's tree),
  [`m0-prototype.md`](../specs/row-subject-truncation/m0-prototype.md) (the approved photographs),
  [`m2-verdict.md`](../specs/row-subject-truncation/m2-verdict.md) (the shipped tree, SC-1 to SC-9)
- **Date:** 2026-10-09
- **Deciders:** James Ewbank (product owner) and Claude Code.
- **Extends:** ADR-0146 D3 ("wraps rather than truncating", written for table columns) and D4 ("a fact
  about a row belongs under that row", written for the audit log and Recently deleted) to list rows.
- **Reverses:** `docs/specs/organisation-landing-portfolio/m9-density-design.md` D1 (one line, the
  context "truncating first").
- **Builds on:** ADR-0182 (the split whose measurement found this), ADR-0179 (the 1024 × 600 floor and the
  narrow-screen notice), ADR-0105 (why this was a spec), ADR-0110 (a gate is verified against the defect it
  names), ADR-0113 (measure the problem first), ADR-0088 D1 (no flag; the rollback is the commit).

## Context

On the organisation landing, "Jump back in", "Where the work stands" and "Recently changed" showed each
plan as `name [Draft] project · client` on one flex line (`RowSubject`, `list-row.tsx`), the name
`truncate` and the context `shrink-[3] truncate`. Flexbox shares an overflow in proportion to shrink
factor times base size, so the name lost `W_name / (W_name + 3·W_context)` of every overflow. The
docblock's "a row's name must survive" was false, and the unit test that guarded it asserted a class
string, not a behaviour, so it was green against the defect it named (ADR-0110).

M9 D1 had merged two lines into one to save 20 px a row on a landing that did not fit its window, on the
assumption that the name survives. It never did. Nobody saw it because the instrument counted a run as
truncated only when the text node's direct parent had `text-overflow: ellipsis`; a plan name's text sits in
the router `<a>` inside the truncating span, so the old count contained no name at all.

Measured on the unchanged tree (M0, `m0-measurement.md`, 17 rows, Explorer at 276 px): **16 of 17 names
clipped at 1024 × 600, 6 at 1280, 3 at 1465, 17 at 1477, 16 at 1646, 11 at 1912 × 948** (where
`Dockside — Ancillary works 6` loses its `6`), 17 of 17 at 200 % text at 1280. At 320 px, `ListRow`'s
`shrink-0` trailing block (`Ada Lovelace · just now`) left the name **6 characters** in "Recently changed" and
10 in "Where the work stands".

## Decision

1. **D1 — `RowSubject` never truncates.** Name, badge and context are not `truncate`, `text-ellipsis`,
   `whitespace-nowrap`, `overflow-hidden` or `line-clamp-*`, and nothing reorders them (no `order-*`,
   `flex-row-reverse`, `flex-wrap-reverse`). This extends ADR-0146 D3 from table columns to list rows: a
   truncated name is a name the reader cannot read. Words wrap at word boundaries; a token wider than the
   column breaks anywhere (`wrap-anywhere`, `rowLinkClass`).
2. **D2 — One line when it fits; otherwise the context moves whole under the name, with no vertical gap.**
   The subject is one `<p data-row-subject>` that is `flex flex-wrap items-baseline gap-x-2 gap-y-0`; a
   vertical gap would break whole-line steps. A row therefore grows by `k × 20 px` and a row that fits keeps
   today's height. This extends ADR-0146 D4. No line cap: a 200-character name takes 10 to 12 lines.
3. **D3 — The badge belongs to the name group.** It follows the name's last word after one collapsible space
   (rendered only when there is a badge, never a margin, which would indent a line the badge starts) and may
   start a line alone. A `sr-only` ", " precedes the context so a screen reader pauses between name and
   context; reading order, DOM order and visual order are the same.
4. **D4 — `ListRow`'s trailing block drops beneath the primary block when the primary would be under 7rem.**
   This is behaviour, not a prop: the container is `flex-wrap gap-x-4 gap-y-0`, the primary `min-w-28
flex-1`, the trailing unchanged. It never fires at or above the 1024 floor (the narrowest track is 564 px)
   and at 320 px leaves a name at least 12 characters wide. `ListRow` gains one additive prop,
   `align?: 'center' | 'baseline'` (default `'center'`, today's behaviour); the two landing rows with a
   trailing fact pass `align="baseline"` so a wrapped row's date or "actor · time" sits on the name's line.
5. **D5 — Clipping is measured from glyph rects, with a positive control before and after.** The probe
   (`apps/web/scripts/row-subject-probe.mjs`) reads `Range.getClientRects()` for every text node, takes line
   widths as the union of intervals, and compares each rect with the nearest `overflow-x` ancestor and the
   viewport. A probe that reports zero is believed only when it reports non-zero on a planted overflow: on the
   unchanged tree it saw 11 clipped names at 1912; on the shipped tree a token injected into one unclipped
   context is reported clipped at 320 × 800 and at 1280 × 800. The `e2e-overview` journey runs the same
   function, not a copy.

## Alternatives considered

- **A. Status quo plus `title`.** Rejected: `title` is invisible to keyboard and touch (`UX_STANDARDS.md` §6).
- **A2. `useTooltip` on the name link; A3. a disclosure per row.** Rejected: a hover, focus or long-press, or an
  extra tab stop, on every row defeats scanning a list.
- **B. Always two lines.** Rejected: charges 20 px to every row that fits. **B2.** Every row in a box two-line
  when any needs it: rejected, uniformity bought with JavaScript measurement; ragged heights accepted instead.
- **D. One line, name never shrinks, context alone truncates.** Declined by the product owner (CQ-1).
- **E. Middle ellipsis.** Rejected: removes the middle, where plans sharing a prefix and suffix differ, and
  breaks left-to-right scanning. **F.** Drop the client, then the project: rejected, facts silently absent (ADR-0127).
- **G. Wider columns or a later split.** Rejected by #472 and ADR-0182 D2: 732 px tracks already clipped.
- **Trailing: a `stackBelow` boolean prop.** Rejected: every consumer needs the same narrow behaviour, so a prop
  is a decision each call site could get wrong. **A container query on `ListRow`:** rejected, it needs
  `container-type` (layout containment, ADR-0182's own caveat) on every row for what `flex-wrap` does with one
  `min-width`.

## Consequences

- **The cost is height, measured and accepted (CQ-1).** Whole rows visible in each capped bottom box
  ("Where the work stands" and "Recently changed"), fixture of 8 rows, Explorer at its default
  (`m2-verdict.md` SC-5):

  | Window      | Before (M0) | Shipped | Accepted floor |
  | ----------- | ----------: | ------: | -------------: |
  | 1646 × 1000 |     3 and 3 | 2 and 2 |        2 and 2 |
  | 1912 × 948  |     3 and 3 | 1 and 1 |        1 and 1 |
  | 1912 × 1114 |     5 and 5 | 3 and 3 |        3 and 3 |

  Box heights (334, 282 and 448 px) and `<main>`'s scroll (949/949 and 897/897) are unchanged. With the
  pathological 200 + 200 + 200 plan a bottom box holds under one whole row and scrolls with its stated count,
  recorded as accepted. The named remedies (raise the `min-h-55` floor; `PageGrid rows="fit-then-fill"`
  rebalancing) are applied only if the product owner asks. Nothing is re-truncated and nothing is `line-clamp`ed.

- **Row heights within a box are ragged**, in whole 20 px steps. Accepted.
- **The badge can land alone** on the line after a name that fills its column (seen at 1646 × 1000).
- **A moved finish date.** In "Where the work stands" the date or "No finish date yet" moves from the row's middle
  to the name's first line even where the subject fits. Heights are unchanged.
- **The staff console's status summary** inherits the narrow drop and its `block` link now spans up to the verdict
  badge (a wider hit area, consistent with that component's own "the whole row is the target"). Pinned by a step in
  `e2e-staff`.
- **The tripwire replaces the class-string test.** jsdom lays nothing out, so the unit tests assert the absence of
  the truncating and reordering utilities and the DOM order; the weight is on the probe and the `e2e-overview` journey.
- **The sizing ratchet admits it:** `min-w-28`, `flex-1`, `gap-x-*`, `gap-y-0` are scale steps.
- **`docs/TECH_DEBT.md` #472 is closed by this record**, and ADR-0182 carries a dated note to that effect.

## References

- `docs/TECH_DEBT.md` #472 (closed; see Closed numbers), #333 and ADR-0182 D2 (the subtitle clause dropped as a
  threshold test)
- `apps/web/src/components/ui/page/list-row.tsx`, `apps/web/scripts/row-subject-probe.mjs`,
  `apps/web/e2e-overview/overview.spec.ts`, `apps/web/e2e-staff/staff.spec.ts`
