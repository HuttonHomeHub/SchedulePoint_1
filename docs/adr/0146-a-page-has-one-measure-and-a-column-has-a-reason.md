# ADR-0146: A page has one measure, a column has a reason, and a fact belongs under its row

- **Status:** Accepted
- **Date:** 2026-09-17
- **Deciders:** Product owner; agent implementation
- **Spec:** [`docs/specs/page-composition/`](../specs/page-composition/)

## Context

ADR-0145 gave nine screens one header rhythm and one section treatment. The product owner then sent
nine screenshots of the result and said the pages were **too narrow, too empty and too thin on
information** — _"this isn't a mobile app its a desktop app. the pages need to be best in class.
contain all relevent informatio, look fantastic."_

Measured rather than described (`m0-measurement.md`), that was three separate things wearing one
complaint:

- **The measure.** `PageContainer`'s `default` was `max-w-6xl` — 1152 px, 1104 of content after
  `p-6` — on a 1646 px screen. Eleven screens shared it and one did not.
- **The columns.** **Eleven columns wrapped** at 1646 while their tables had room: a date broken over
  two lines reads as two dates. The cause was fifteen hand-written `md:w-*` caps, each chosen
  against a fixture rather than against content.
- **The empty columns.** The audit log carried an `Outcome` column whose every cell is empty on a
  healthy installation, beside a filter offering to narrow by it.

And underneath all three, `#324`: **every focus ring in the product is a `box-shadow`**, which
`forced-colors: active` computes to `none`. WCAG 2.2 §2.4.7, level A, on every focusable control.

## Decisions

### D1 — One page measure, and it is the one that already existed

`PageContainer`'s `default` repoints to **`max-w-screen-2xl`** (1536 px; 1488 of content). The
product owner chose this over the analyst's 1400 px recommendation, on the ground that the value was
already in the file as `wide` and a second number would be a second thing to keep in step; `wide` is
retired and its one consumer moves to the default. Measured: **+217 px at 1646**, which matched M0's
prediction to the pixel and not the spec's +204.

**There are three content widths, not two, and FC-1 had to be split because of it.** At 1646 the
org-scoped screens are limited by the shell's **region** (1369 px), not by the measure; `/staff` and
`/me/activity` render outside that shell and get **277 px more**. So a condition written as
"every screen renders at the same width" is unsatisfiable by any measure, and it became FC-1a (one
declared `max-width`) plus FC-1b (screens sharing a shell region agree within 2 px).

### D2 — A list screen frames its rows in a named region that states how many it holds

`SectionCard` gains a `count`, rendered `aria-hidden` because the screens already announce their
settled result count through a live region and two announcements of one number is how a reader hears
"1" twice and has to work out whether they are two facts. `PageHeader` gains an `aside`.

### D3 — A column declares its width by what it holds, never as a number

`Column.width: 'fit' | 'bounded' | 'auto'`. **`fit`** is `md:w-px md:whitespace-nowrap` — responsive,
because an all-`fit` table renders 793 px of content in a 320 px container. **`bounded`** is
`md:max-w-prose` and **wraps rather than truncating**, because a truncated name is a name the reader
cannot read. **`auto`** is no classes at all, and a column that declares it is making a choice: FC-2
forbids wrapping except in an `auto` column, and a rule whose exception is also its default is
vacuous unless somebody writes the exception down.

Measured: **11 wrapping columns → 0** at 1646.

### D3b — A detail read carries child counts; a list read is structurally barred from them

Client and Project detail state their children. The product owner's answer to this question was
**"Yes — measure cost first"**, so FC-9 was committed in its own commit before the harness existed
and `database-architect` designed the access.

**No schema change and no index**, for a reason rather than by omission: the soft-delete-scoped
partial uniques on `(parent_id, name) WHERE deleted_at IS NULL` — which exist to make a name
reusable after deletion — already serve every one of these counts, leading key and predicate both.
ADR-0144's refusal does not transfer because its mechanism is a **payload column** and `COUNT(*)`
has none.

**The counts are on the detail reads and cannot reach the list reads.** `ClientResponseDto` was
returned by both `list()` and `get()`, so a field added for the detail screen would have appeared on
the list **without anyone choosing it** — measured at 2,124 clients / 50,004 projects, Prisma's
`_count` on a page emits a grouped subquery with no client restriction: **14.509 ms against
0.034 ms**, and, worse than the number, `clients_organization_id_created_at_id_idx` disappears from
the plan, so a page costs O(all projects in the installation) and the pagination stops being
pagination. Separate DTO classes, a structural test, and an e2e case over the wire.

**`_count` is not the mechanism** the spec's §4.10 claimed for all four counts: it takes direct
relation fields only, and two of the four are two-level. All four use `count()` with a relation
filter — one mechanism, and cheaper than `_count` even where `_count` works.

**A count is absent, never zero**, when it could not be taken (ADR-0126: `0` is a claim), settled
independently of the subject read and of its sibling.

### D4 — A fact about a row belongs under that row

Two applications, and the second is the one that changed the work. The audit log's `Outcome` column
folds into the Event row, keeping the `sr-only` success — deleting it would be a silent WCAG
regression, since a screen-reader user could not tell a success from a row whose outcome nobody
rendered. And Recently deleted's blocked-restore control names its blocker **under the row** rather
than in the middle of its own label.

**M0 disproved that second one's premise before it was built.** It was filed as a clipped control;
measured, `scrollWidth === clientWidth`, `overflow: visible`, and the `…` is **literal text in the
source**. No CSS remedy was owed. What is wrong is copy: `Restore ddde first…` puts the variable part
mid-sentence, so the conventional "this opens a dialog" suffix reads as a truncation.

### D5 — Windows High Contrast gets a native outline, from one unlayered rule

`#324`. One `@media (forced-colors: active) { :focus-visible { outline: 2px solid Highlight;
outline-offset: 2px } }` at the end of `globals.css`, **outside every `@layer`**.

**The layer is the whole remedy.** Tailwind v4 emits its utilities inside `@layer utilities`, so
`.focus-visible\:outline-none:focus-visible` is a layered (0,2,0) and this is an unlayered (0,1,0),
and an unlayered declaration beats every layered one whatever its specificity. That is the only
reason one rule overrides 61 occurrences across 49 files without touching a call site — and it is a
fact about the **build**, so it was checked against `dist/assets/index-*.css` by a brace-depth walk
of the emitted file rather than reasoned about.

**The reasoning was overclaimed and the M7 component review caught it.** The first version of this
decision said unlayered was the only mechanism; an `!important` declaration inside `@layer base` also
wins, because `!important` is resolved before layer order — and the proof is eight lines above the
new block, where the `prefers-reduced-motion` rule uses exactly that. ADR-0076 Class 3, one paragraph
from a working counter-example in its own file. Unlayered is still the choice, for the reason the
overclaim was standing in for: overriding a non-important unlayered rule needs only `!important` in
any layer, where overriding an `!important` in the first-declared layer needs an earlier layer, which
does not exist. A rule that has to be edited to be extended is the worse of two that behave
identically today — and this decision's own trigger to revisit is a control needing a differently
shaped ring.

**The spec's own second half is withdrawn on what the block turned out to be.** D5 as approved said
to follow the global rule with a per-primitive CVA migration and a census. The rule is universal and
gated, so after it there is no control whose correctness the migration improves; it would be 61 edits
to shared primitives' public contracts producing no rendered difference in either mode.

## Consequences

**FC-9 judged three limbs PASS and withdrew one count.** `client.planCount` plans as a `Seq Scan on
projects` once a client holds a substantial share of that table — 4.12 ms at 500 of 2,000, and
O(projects in the installation) rather than O(this client). The clause as committed withdraws all
four; three are index-only at every shape at 0.10–0.29 ms. So it is applied to the one that failed
and **the re-argument is in writing**, which is what the clause explicitly permits in place of
quietly relaxing the bar.

**Two of the epic's conditions failed and neither bar moved.** FC-2's prose-density half was withdrawn
by its own withdrawal clause; FC-3 failed by **2 px** — `SectionCard`'s own border — and was put to
the product owner with both consequences costed and amended in place at the measured value rather
than at a round number.

**Three of the spec's claims were disproved before anything was built**: the restore ellipsis, the
filter-bar overflow (quoted forward as "~246 px over at every width"; measured `overflowsBy: 0`, the
bar wrapping to three lines and 122 px tall instead), and the +204 px figure.

**The instruments were wrong more often than the code, six times.** Two are worth carrying:

- `measure-column-fit.mjs` counted rendered rects and reported "Edit" as two lines; it now clones the
  cell into an off-screen host at the same width and compares wrapped against `white-space: nowrap`,
  and refuses a verdict unless it still reports the two wraps known to exist.
- The M6 journey assertion **passed against the very column it was written to catch, twice**.
  `DataTable`'s loading `<thead>` prints no header text at all and its skeleton is three visible
  rows, so a scan taken there examines nothing and reports success. It now waits for a real cell and
  carries a pinned control asserting it examined something before its verdict is believed —
  ADR-0093's shape, in the instrument rather than the product.

**And the FC-9 harness found its own faults first, twice.** Its first judged run reported the clients
LIST plan as a `Seq Scan on clients` over a table holding **six rows**, where a sequential scan is
obviously right: the dilution guard it deliberately carries covered `projects`, `plans` and
`activities` and not `clients`, so the regression limb was grading the instrument. And it never
vacuumed, so every index-only scan paid a heap fetch and it measured the worst state a table is ever
in. Both ends of that range are now printed.

**The CPM engine is not imported and no migration runs.** `computeSchedule` is not called, not
imported and not reachable from anything this epic touches, so the ADR-0034 recalculation parity gate
is untouched by construction.
