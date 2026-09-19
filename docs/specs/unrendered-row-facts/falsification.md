# Falsification conditions — the unrendered row facts

**Committed 2026-09-19, before the harness ran.** ADR-0128's ordering: a bar written after the
measurement is a bar chosen to be met. ADR-0142 D4 is the other half — an approved remedy is a
claim that it will work, and approval does not make it one, so `docs/TECH_DEBT.md` #343's own
proposed fix is judged here rather than assumed.

Four conditions. Two can withdraw the column; two cannot be waived. Each names its instrument, its
baseline and its withdrawal clause, so nobody trying to ship at M3 has room to reinterpret one.

**FC-D carries a prediction written down to be falsified**: slack ≈ 1012px. The register row quotes
922px, which is a **pre-D4** reading taken when Clients had three columns; the two-column state has
never been measured by this instrument at all. If 1012 is wrong it is recorded as wrong.

---

#### FC-A — nothing wraps beside unused width

**Bar:** at 1280, 1646 and 1920, **zero** cells wrap in the Clients table, except in a column
explicitly declared `auto`.

This is page-composition FC-2's bar, adopted verbatim rather than re-run (§0.2b). It is the
condition the register row asks for, and it is the one a new column can break: `fit` takes exactly
what its content needs, so the surplus it surrenders has to come from somewhere, and the column it
comes from is the one that then wraps.

**Judged by:** `measure-column-fit.mjs`, **with its control repaired** — the probe must refuse a
verdict unless it can still see a live wrap, and the two it names were fixed at M2. Running it under
`EXPECT_KNOWN_WRAPS=0` is not acceptable evidence here; a probe with no positive case reports zero
wraps and a product with no wraps reports zero wraps, and nothing distinguishes them.

**Withdrawal clause:** a column that cannot meet this without truncating is declared `auto` and the
exception is recorded with the content that forced it. If `Created` is the column that cannot, the
column is **withdrawn** rather than declared `auto` — a date wrapping over two lines reads as two
dates (`m2-measurement.md:18-19`), which is worse than not showing it.

---

#### FC-B — reflow at 320px

**Bar:** at 320px CSS width, `documentElement.scrollWidth <= clientWidth` on `/orgs/:slug/clients`.

**Baseline:** 0px overflow (`m2/drift-320.json`, and the standing journey case at
`composition.spec.ts:468-481`).

This is not ceremony. M0 measured an all-`fit` table rendering **793px inside a 320px container**,
because `white-space: nowrap` has no fallback — a 433px overflow and a WCAG 2.2 §1.4.10 failure.
That is why `fit` is `md:` upwards, and this work adds a `fit` column to a screen that is already in
the journey's 320px sweep.

**Withdrawal clause:** none. This is a merge requirement (CLAUDE.md §13).

---

#### FC-C — the new column pushes nothing below the fold

**Bar:** at 1646 × 1000, the Clients table's `firstRowTop` does not increase, and the page still
does not scroll.

**Baseline:** `firstRowTop: 305`, `mainScrollHeight === mainClientHeight === 949`
(`m8/drift-1646.json:101-102`, `:144`).

A column adds no height — until its **header** wraps, or until a cell taller than the current row
height appears. Both are cheap to check and neither is obvious from source. FC-8 became a gate at
ADR-0146 M8 for exactly this reason and the gate already covers `clients`
(`composition.spec.ts:510-516`), so this condition is mostly a re-reading of an existing assertion
under a changed table.

**Withdrawal clause:** none.

---

#### FC-D — the emptiness the row complains about actually falls

**Bar, relative and deliberately not numeric:**

1. The Clients table's `factSpread` at 1646 is **strictly greater than `0`** (baseline: `0`).
2. The table's slack (`tableWidth − naturalTotal`) at 1646 **falls**, by at least the rendered width
   of the new column — i.e. the column is paid for out of existing emptiness and not out of another
   column's content.

**A numeric bar is refused, and the refusal is the honest half.** Slack here is fixture-dependent:
the shoot harness mints a tenant per run and the client names are arbitrary, so "slack < 700" would
be a number tuned to three rows called _Bellway Homes_. ADR-0146's own record holds two cases of a
bar chosen against one composition and quoted forward as though it were general, and
`m8/README.md:20-23` warns about exactly this family of fixture-dependent figures. A relative bar
cannot be gamed by a fixture.

**It is a weak condition and is labelled as one.** Clause 1 is nearly trivially satisfied by adding
any second fact column — which is precisely what makes it the right statement of the row's
complaint, since the defect _is_ that the number is `0`. Clause 2 is the one that can fail: if the
new column's width comes out of `Name` rather than out of slack, the remedy has moved the emptiness
rather than filled it.

**Prediction, written down to be falsified (§0.2e):** post-D4 pre-remedy slack at 1646 should be
about **1012px**, against the 922px the row quotes from the pre-D4 reading.

**Withdrawal clause:** if clause 2 fails, the column is withdrawn and the reason recorded — a
`Created` column bought by squeezing client names is not an improvement.

---
