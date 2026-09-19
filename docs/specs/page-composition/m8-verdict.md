# Page composition — the nine falsification conditions, judged

**Taken:** 2026-09-17, at M8.
**Conditions:** `falsification.md`, committed at M0 before any remedy existed.

Five of the nine were judged in the milestone that moved them and are collected here rather than
re-taken. **Four had no recorded verdict anywhere until this pass**, which is the first thing worth
saying: FC-4, FC-5, FC-7 and FC-8 each had an instrument named at M0 and nobody had written down
what it said. A condition nobody judges is a condition that was never armed — and FC-8 turned out to
have no instrument at all, only a named quantity.

| Condition                                                | Verdict                             | Where the evidence is      |
| -------------------------------------------------------- | ----------------------------------- | -------------------------- |
| FC-1a — one declared measure                             | **PASS**                            | `m1-measurement.md`        |
| FC-1b — screens sharing a shell region agree             | **PASS**                            | `m1-measurement.md`        |
| FC-2 — nothing wraps beside unused width                 | **PASS**                            | `m2-measurement.md`        |
| FC-3 — the widening costs no screen width                | **PASS**                            | `m1-measurement.md`        |
| FC-4 — every list sits in a framed, named section        | **PASS**                            | below                      |
| FC-5 — a focus ring survives forced colours              | **PASS**                            | below                      |
| FC-6 — reflow at 320px                                   | **PASS**, and now gated             | `m2-measurement.md`, below |
| FC-7 — the design-system ratchets do not rise            | **PASS**                            | below                      |
| FC-8 — nothing added pushes the first row below the fold | **PASS**, and now gated             | below                      |
| FC-9 — the detail counts cost a detail read little       | **3 limbs PASS, 1 count WITHDRAWN** | `falsification.md`, `m5/`  |

No condition was softened and no withdrawal clause was invoked except FC-9's, which was applied in
writing to the one count that failed rather than to all four (`m5/README.md`).

---

## FC-4 — every list sits in a framed section with an accessible name: **PASS**

**Baseline:** six screens had none — `clients`, `calendars`, `resources`, `audit-log`,
`recently-deleted`, `my-activity`.

**Judged by** `page-frame.structural.test.ts`, extended as the condition said, plus the journey's
`a list screen frames its rows in a named region`. The pair is deliberate and neither half is
sufficient: the gate reads source, so two siblings satisfy "renders both tags" while looking exactly
wrong; the journey asks whether the rows are **inside** the region, which is a question about two
boxes and therefore a browser's to answer. Both green.

**Two screens are declared exceptions with reasons** (`staff.tsx`, whose own card archetype predates
this one; `plan-detail.tsx`, whose `PageContainer` is the not-found branch and renders no rows), and
the list is non-empty on purpose — "every exception carries a reason" passes against nothing.

The M8 accessibility review independently confirmed the three regions on Members by name.

## FC-5 — a focus ring is visible under forced colours: **PASS**

**Baseline:** zero pixels change. The built CSS contained **zero** `forced-colors` rules, and the
focus treatment computed to `outline: none 0px` / `box-shadow: none`.

**Judged by** `apps/web/e2e-forced-colors/` — 4 passed, in the sweep and again alone. It asserts on
**pixels** under `forcedColors: 'active'` for three primitives, and carries a `forced-colors: none`
control read **while the control is focused**, because the first version of that control read an
unfocused element, where `:focus-visible` cannot match and the assertion passes against the defect.

**What M7 was told to establish, it established**: a block written at the end of `globals.css`
outside any `@layer` compiles to an unlayered rule — pinned by `focus-ring.structural.test.ts`'s
brace-depth walk, because that is a fact about the build rather than about the cascade, and the
remedy depends on it.

**One claim in the condition's own text is corrected** rather than left standing: it says the
unlayered block "beats the layered utility despite losing on specificity … No `!important`". The
first half is right and the exclusivity implied by the second is not — `!important` inside
`@layer base` also wins, because importance is resolved before layer order, which the
`prefers-reduced-motion` block eight lines above already demonstrates. Unlayered is kept on
extensibility grounds, not because it is the only thing that works. Found by the M7 component
review; corrected in `globals.css`, `DESIGN_SYSTEM.md`, `m7-record.md` and ADR-0146.

## FC-6 — reflow at 320px: **PASS, and it stops being a one-off**

`m2-measurement.md` records every in-scope screen still overflowing by **0px**, which was the
milestone's real risk: M0 measured a table whose columns are all `fit` rendering **793px inside a
320px container**, because `white-space: nowrap` has no fallback. `fit` is therefore `md:` upwards
only.

**Its evidence was an artefact rather than a gate**, which the M8 component review pointed out: a
one-off `m2/drift-320.json`, so a future author dropping the prefix would break reflow on the two
screens whose content motivates `fit` and nothing in CI would say so. There is now a journey case
asserting `documentElement.scrollWidth <= clientWidth` at 320 across four list screens, waiting for
a settled table first so it cannot pass against a skeleton that has no `whitespace-nowrap` cell in
it.

## FC-7 — the design-system ratchets do not rise: **PASS**

`SCREEN_WEIGHT_CEILING = 157` and `ARBITRARY_SIZING_CEILING = 17`, identical to `origin/main`,
re-checked after M8's fold-ins. Both gates green (`token-architecture.test.ts`).

Worth noting why this is not luck: both ratchets **strip comments before scanning**, a repair
ADR-0099 M4 made after the weight ratchet counted `font-medium` inside its own docblocks, so that
writing down reasoning pushed the gate towards failing. This epic adds a great deal of prose to
components and none of it counts.

## FC-8 — nothing this epic adds pushes the first row below the fold: **PASS**

**This condition had no instrument.** It named a quantity — "the first content row" — that nothing
in the harness recorded, so it could only ever have been judged by argument. `firstRowTop` was added
to `measure-page-drift.mjs` at M8 and the reading taken (`m8/drift-1646.json`, and see that
directory's README for what `run.sha` does and does not mean).

At 1646, against a 1000px viewport with a 949px content region:

| Screen             | first row(s) | page scrolls? |
| ------------------ | ------------ | ------------- |
| `clients`          | 305          | no            |
| `client-detail`    | 265          | no            |
| `project-detail`   | 265          | no            |
| `calendars`        | 361          | no            |
| `resources`        | 333          | no            |
| `members`          | 261, 473     | no            |
| `audit-log`        | 445          | yes           |
| `recently-deleted` | 277          | no            |
| `my-activity`      | 445          | yes           |

Every one is above the fold, the worst by more than 470px.

**The "pushed by anything added here" half is answered from the baselines rather than asserted.**
Eight of the ten in-scope screens do not scroll **at all** at 1646 — `mainScrollHeight ===
mainClientHeight === 949` at M0, at M1 and now — so their whole content is above the fold and the
question does not arise. The two that do scroll are the audit screens, and both are **shorter** than
they were: `my-activity` 2372 → 2275 → 2127. (`audit-log` reads 2100 → 1935 → 2053, and that last
figure is a different number of audit events in a freshly-minted tenant, not a layout change — see
the M8 README. Its first row is at 445 either way, which is the quantity FC-8 is about.)

Two specific risks were checked rather than assumed. The `ChildCounts` aside is **inline in the
header row**, not a band above the list, so it adds no height — which is what makes M8's repair to
that slot a layout fix and not a fold risk. And Project detail's new Calendars section renders
**below** the Plans table, so it cannot push the first row of anything down.

**The condition's own withdrawal clause did not have to fire.** It reads: a summary strip that pushes
the list down is withdrawn, it has not earned its place. Decision 4 declined to build one, and M4-T2
withdrew the one that was drafted, on the stated test.

**It is now a gate rather than a reading** (ADR-0058), across five screens with settled-content
waits, at the viewport this project measures everything else at. The thing FC-8 protects against is
the **next** heading, strip or filter bar added above a list, and this epic added several.

## FC-9 — see `falsification.md` and `m5/`

Judged at M5. Three limbs PASS; `client.planCount` withdrawn on a measured `Seq Scan on projects`,
with the clause applied to the count that failed and the amendment argued in writing.

**Two corrections to that record were made at M8**, both from the backend-performance review and
both folded where they belong: the `added` column is the sum of all four counts for a shape rather
than one route's own, and "cold" there means an unset visibility map rather than the dropped OS page
cache the neighbouring migration note means by the word — which is the state this product boots into
on every release. Neither changes a verdict; both change what the numbers may be quoted as.

---

## What the epic does NOT claim

- **`staff` and the org-scoped screens still differ by 167px**, and no measure can close it: they
  render in different shells (FC-1's restatement at M0 is the argument). FC-1a is about the declared
  measure and it is now one value.
- **`staff` overflows at 320px by 251px** and fails WCAG 2.2 §1.4.10. Pre-existing, recorded at M0,
  untouched here, and not a regression.
- **The loading skeleton still reflows** against the settled table for any column without a fixed
  width. Pre-existing, honestly scoped, `docs/TECH_DEBT.md` #341.
- **Two screens carry facts they hold and do not render** — `docs/TECH_DEBT.md` #343, recorded at M8
  rather than built, because a new column is a new surface and a gate pass is the wrong place for one.
