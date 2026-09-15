# M2 — the frame, measured

**Status:** Approved
**Taken:** 2026-09-14, Chromium, the §4.7 unhealthy recipe.
**Artefact:** `apps/web/.screenshots/1646/staff-unhealthy.png`.

Every figure below is a **same-sitting** comparison — stash the change, measure, restore, measure —
because `m0-measurement.md` §10 established that this page's height drifts upward on its own and a
before/after taken hours apart measures the database rather than the design.

## 1. What the frame bought

| quantity at 1646 × 1000 | before (M1) |    after (M2) |             change |
| ----------------------- | ----------: | ------------: | -----------------: |
| Document height         |    8,781 px |  **7,686 px** | **−1,095 (−12 %)** |
| Content column          |      896 px |  **1,536 px** |          **+71 %** |
| Unused horizontal space |  750 (46 %) | **110 (7 %)** |                  — |
| **Every table**         |      798 px |  **1,438 px** |          **+80 %** |
| FC-1, conditions ≥ fold |      3 of 5 |    **4 of 5** |             **+1** |

**FC-4 PASSES**, and by the margin its arithmetic predicted. Every table on the page is 1,438 px
against today's 798 — 1,342 at 1440 and 1,182 at 1280, so it passes at every measured width, not
only the widest. This is the condition the design review added because **nothing else in the epic
could have seen its failure**: had the epic built "two equal columns throughout" as approved, these
tables would read **737 px** and FC-1, FC-2 and FC-3 would all have passed anyway.

## 2. FC-1's judging point was wrong, and it is my own re-slice that was wrong

The re-slice put FC-1's verdict at M2, so the frame could be reverted in one commit if it buried a
condition. **The frame does not bury one — it lifts one**: "Retention sweeping is disabled" moves
from 562 px below the fold to 716 px above it, purely from the order change. 3 of 5 → 4 of 5.

But FC-1 still fails, and **it was always going to at M2**, because FC-1's stated mechanism is US-1's
summary — _"every non-healthy condition is named or counted within the first viewport"_ — and the
summary is M3. Judging a condition finally at the milestone before the one that builds its mechanism
is a scheduling error, and it is mine: the re-slice moved the layout earlier for good reasons and
carried FC-1's verdict along with it without checking that the verdict could be reached there.

So, corrected rather than quietly moved: **M2 judges FC-4 and FC-1a, and FC-1's _direction_. FC-1's
verdict is M3's.** The distinction is not a softening — if the frame had moved FC-1 the wrong way,
that would have been the withdrawal trigger the re-slice intended, and it is exactly what these two
measurements were taken to detect.

The one condition still below the fold is the unverified-account count, at 321 px. It is the kind of
fact a summary states in a clause, which is the argument for M3 rather than for more layout.

## 3. The two-column grid buys exactly one paired row, and that is recorded rather than dressed up

Five of the seven sections are table-bodied and therefore `wide`, so the only pair is **Installation
beside Diagnostics** — four facts beside **two** controls, neither an order of magnitude taller than
the other. That is a smaller win than "two columns" sounds like.

**What actually fixed this page is width and order, not columns.** The tables gained 80 %, the
margin fell from 46 % to 7 %, and the conditions moved above the inert tools. The columns
contributed one row, about 250 px.

Pairing more would have meant one of two things, and both are refused: narrowing a table, which FC-4
forbids and which is the precise regression the span rule exists to prevent; or making a span depend
on how much data happened to arrive — a `wide` CSP section is a mostly-empty card today because
there are no violations, and making it `narrow` for that reason would make the page's layout a
function of its database.

## 4. The merge departs from the spec's own resolution, deliberately

`feature-spec.md` §8.12 resolved the Mail + Retention merge as _"the merged card's title stays
**Mail**"_ with retention as an `<h3>` inside it. **Built, that reads as a false claim about the
hierarchy**: retention is not a kind of mail, and subordinating it demotes the panel an operator goes
looking for by name when they want to know whether the sweep is arming.

So the card is **"Mail and retention"** with **two `<h3>`s of equal rank**. Measured, the heading
tree is:

```
H1 Staff console
H2 Mail and retention
   H3 Mail
   H3 Retention
H2 Content-Security-Policy
H2 Unverified accounts
H2 Installation
H2 Diagnostics
H2 Performance
H2 Staff activity
```

Retention keeps a heading, which was the accepted cost of the merge — folded into mail's prose it
would have left the heading list entirely, and that cuts against the "seasoned admin navigating with
ease" framing this epic was given, because an expert AT user relies on heading shortcuts **more**.

The polite sentence is **composed, not concatenated**: two clauses each naming their own subject,
joined with a full stop and a space, with a pending half **absent** rather than empty — a trailing
separator is a pause that means nothing.

## 5. Two unit assertions changed, and what they protect did not

`staff.test.tsx`'s two retention announcement tests failed on the merge, because the retention
clause is now a substring of one composed sentence and `getByText` matches whole text nodes. They now
read the polite region's **text**.

**The part that must not be lost was kept**: both still assert on the `aria-live` region rather than
on the document. The visible alert says the same words, so a document-wide query would stay green
while the announced line went back to claiming health during a failure — which is the exact defect
the ADR-0086 accessibility review found. The helper joins _every_ polite region, so a future second
one cannot silently drop out of the assertion.

## 6. The DOM-order gate, verified red both ways

`page-grid.structural.test.ts` refuses a Tailwind `order-*`, a dense auto-flow, and a raw CSS
`order` declaration in the primitive — verified red by injecting `order-2` on the item and
`grid-flow-dense` on the container, which are the two shapes it is written to catch.

It guards the **primitive**, so the next surface to reach for `PageGrid` inherits the rule without
having to know it exists. Its blind spot is stated in its own docblock: a consumer that hand-rolls
`order` on a child _inside_ a `PageGridItem` is invisible to it, and nothing that reads source can
close that — the compensating control is a rendered DOM-sequence assertion.

> **Corrected 2026-09-15 (M6 UX review): "three controls" was two.** `DiagnosticsPanel` renders
> `Run diagnostics` and `Copy for the record`, and nothing else. The wrong figure was written here
> and copied into `staff.tsx`'s own comment, so it appeared in two places and was disprovable by
> counting — the ADR-0076 class this epic invokes elsewhere, committed by its own author. The
> pairing argument is unaffected: what makes the row work is that neither panel has a table and
> neither is an order of magnitude taller than the other.
