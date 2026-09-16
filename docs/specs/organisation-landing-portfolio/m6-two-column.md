# M6 — the two-column landing, measured before and after

**Status:** Approved — the grid is **built**; FC-4 is **amended, not waived**, on the finding that its
bar was measured inside a container that made it unpassable at any width.

**Taken:** 2026-09-16, build `web 0.132.0 · api 0.65.0` (read off the shell footer, not assumed).
Both runs used the same harness, `apps/web/scripts/measure-overview.mjs`, in one sitting against one
seeded fixture — the before/after spread this reports is therefore a property of the change and not
of the machine.

---

## 0. Why this was re-opened

The product owner opened the released landing on a 1920 screen and asked why it was still a single
column of four boxes when the epic had agreed two. Three things were true and only one of them was
in the record:

1. **CQ-3's default really was two columns** — but "gated on FC-4, and withdrawn to a stacked single
   column if any row section measures narrower". The gate fired. That much worked as designed.
2. **FC-4 could never have passed.** `OverviewScreen.tsx` rendered `PageContainer width="narrow"` —
   `max-w-4xl`, 896 px, less `p-6` either side = **846 px of content**. FC-4's bar was "no section
   narrower than its 846 px baseline". Two columns of 846 plus a 24 px gap is 1,716 px, which does
   not fit inside 848 px on any monitor ever built. `m5-verdict.md` §1 reports this as
   "needs 1,716, has 1,646", which reads as though a wider screen would have saved it. **It would
   not.** The measurement below settles that empirically rather than by arithmetic.
3. **The precedent was one file away.** `routes/staff.tsx:139` is `PageContainer width="wide"`, and
   ADR-0143 records its tables going 798 → 1,438 px by exactly the mechanism withdrawn here. The
   landing kept `narrow` and then concluded two columns were impossible _inside_ `narrow`.

ADR-0142 D4 says a remedy is measured before it is built. This adds the sibling nobody had written
down: **a constraint is measured too.** FC-4 was an approved falsification condition, and it was
wrong — not in its number, but in what it was a number about.

---

## 1. FC-4 — the page does not respond to width at all (the finding)

Every section, every width, before the change:

| Viewport | Jump back in | Needs your attention | Where the work stands | Recently changed |
| -------: | -----------: | -------------------: | --------------------: | ---------------: |
|     1280 |          846 |                  846 |                   846 |              846 |
|     1440 |          846 |                  846 |                   846 |              846 |
|     1646 |          846 |                  846 |                   846 |              846 |
| **1920** |      **846** |              **846** |               **846** |          **846** |

**846 px at 1280 and at 1920 alike.** Widening the browser by 640 px changes nothing; the surplus
becomes empty gutter. On the 1920 screenshot that is roughly 650 px of unused window beside content
still as wide as ADR-0098's measure rule was introduced to narrow.

1920 had never been measured. Every FC-4 figure the grid was withdrawn on was taken at 1646, 1440
and 1280 — three widths narrower than the one being complained about — so the harness now carries
1920 permanently.

## 2. After — `PageContainer width="wide"` + `PageGrid`, all four sections `narrow`

| Viewport | Section width | vs. 846 |
| -------: | ------------: | ------: |
|     1280 |           464 |    −382 |
|     1440 |           544 |    −302 |
| **1646** |       **647** |    −199 |
| **1920** |       **730** |    −116 |

**FC-4, as written, FAILS at every width.** That is the intended consequence, pre-authorised by the
product owner in the words "scaling the boxes down to fit", and it is recorded as an amendment
rather than a pass because a condition quietly reinterpreted is a condition deleted.

## 3. What the narrowing buys

|                                 |   Before |    After | Change    |
| ------------------------------- | -------: | -------: | --------- |
| Questions above the fold @ 1646 |   4 of 7 |   6 of 7 | **+2**    |
| Questions above the fold @ 1920 |   4 of 7 |   6 of 7 | **+2**    |
| Page content height @ 1646      | 2,386 px | 1,451 px | **−39 %** |
| `…/overview` requests per load  |        1 |        1 | unchanged |

Section geometry at 1646 — the four sections become two rows of two:

| Section               | before top | before height | after top | after height |
| --------------------- | ---------: | ------------: | --------: | -----------: |
| Jump back in          |        155 |           158 |       155 |          158 |
| Needs your attention  |        337 |           463 |   **155** |          463 |
| Where the work stands |        824 |           789 |   **642** |          809 |
| Recently changed      |      1,637 |           749 |   **642** |          749 |

"Where the work stands" grows 789 → 809 px, which is the honest cost of a narrower column: its
sentences wrap one line more often. It is paid back many times over by the pairing.

### FC-1 is 6 of 7, not 7 — and the seventh is named rather than chased

Q7 ("is anything flagged in the schedule?") lands at **1,398 px** (1646) and **1,378 px** (1920),
against a 1,000 px fold. It is the only one still below. The reason is not layout: the fixture's
flagged plan is the _sixth_ row of "Where the work stands". Reaching 7 of 7 means either shortening
that list above the fold or ordering flagged plans first — a **content** decision, not a width one,
and deliberately out of scope here.

> **CORRECTED 2026-09-16 (M7).** This paragraph said the section "is ordered by movement magnitude
> and a flagged plan can sit anywhere in it". It is ordered by **recency** and always has been:
> `overview.service.ts` builds `orderedStanding` by mapping over `recentlyChanged`, which is
> `ORDER BY changed_at DESC`. Asserted from memory rather than read (ADR-0076 Class 3), and it was
> not harmless — it named the wrong rule as the one that would have to change, in the very sentence
> explaining why the question was being deferred. M7 ordered flagged plans first and FC-1 is now
> **7 of 7** at both widths (`m7-flagged-first.md`).

**This retires a claim I made to the product owner.** `m5-verdict.md` §3 concluded that 4 of 7 was
"the proven ceiling across all 24 orderings", and that search was over a **single-column stack** of
158 / 463 / 789 / 749 px. Two columns roughly halve the stacked height, and the ceiling moves to at
least 6. The exhaustive search was correct about the thing it searched and was reported as a fact
about the page.

## 4. What it costs, stated rather than buried

**At 1280 the rows are cramped.** 464 px columns make a plan name wrap to two lines and truncate its
`project · client` subtitle (`landing-1280.png`, §7). It is legible, not comfortable. Neither of
the product owner's screens is at that width, and the remedy is the denser-row work already filed —
not a wider container, which is what produced the defect this milestone repairs.

**Below `md` (768 px) `PageGrid` collapses to one column**, which is the primitive's own rule and
correct: two 366 px columns on a tablet would reproduce exactly what this exists to avoid.

## 5. What did not have to be built

- **The reading-order rule is inherited.** `page-grid.structural.test.ts` forbids `order`,
  `grid-auto-flow: dense` and raw `order:` **in the primitive**, so WCAG 1.3.2 is satisfied here
  without a second gate — ADR-0143's stated payoff ("the next surface inherits the rule without
  having to know it exists"), collected.
- **All 152 unit cases for this feature passed unedited**, because they query by role and
  accessible name. An invariant you have to touch to make room for your change was never an
  invariant.

## 6. Two instrument findings

**The harness had never photographed the screen it scored.** It measured four widths for a whole
epic and produced no image. ADR-0099 was opened after four consecutive epics measured this product's
layout, each reported a plausible number, and what settled it was a screenshot of a screen the shot
list did not cover. Same hole, same screen family. `measure-overview.mjs` now writes full-page
photographs at 1920 / 1646 / 1280 on every run.

**The new journey assertion was red for the wrong reason first, and the red run was therefore
void.** It located sections with `section[aria-labelledby]`, which matched **two of the four** —
`SectionCard` names itself with `aria-labelledby` or `aria-label` depending on the call site — so it
failed against a correct two-column page. That is `measure-overview.mjs`'s own recorded trap
(`[role="region"]` matching nothing) repeated one file over. Rewritten on `getByRole('region')`,
which computes the implicit role, then **re-verified red properly**: four sections at
155 / 337 / 479 / 705, all distinct tops, i.e. stacked.

## 7. Photographs

Written by the harness, not committed — this repository has no image pipeline (ADR-0077 §3) and a
screenshot of a seeded fixture goes stale the moment either changes. Re-take them with:

```
SP_SHOT_DIR=/tmp/landing-shots node apps/web/scripts/measure-overview.mjs
```

- `landing-1920.png` — the width the complaint was raised about
- `landing-1646.png` — the product owner's Surface Pro
- `landing-1280.png` — the cramped end, §4
