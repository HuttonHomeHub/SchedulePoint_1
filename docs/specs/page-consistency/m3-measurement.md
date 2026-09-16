# M3 — the prose: FC-2 is WITHDRAWN, and the diagnosis is the useful part

- **Taken:** 2026-09-16, 1646 × 1000, **one sitting** — ADR-0143 M7 records this page family
  drifting 555 px between sittings with no product change.
- Before: `density.json` (M0). After: `m3-density-1646.json`. Composition: `m3-stack.json`.

---

## 1. The verdict

**FC-2 fails, and its withdrawal bar fires.**

| Screen    | Chrome before | after   | fall    | rows in the first screen |
| --------- | ------------- | ------- | ------- | ------------------------ |
| clients   | 180           | 172     | −8      | 16 → 16                  |
| calendars | 304           | 296     | −8      | 14 → 14                  |
| resources | 276           | 268     | −8      | 14 → 14                  |
| members   | 269           | 269     | 0       | 1 → 1                    |
| audit-log | **414**       | **382** | **−32** | **9 → 10**               |

- **Spread: 234 → 210 px.** The bar was **≤ 80**.
- **Worst screen falls 32 px.** The bar was **≥ 100**; the withdrawal threshold was **< 60**.

Per spec §1, stated before any of this was built: _the density half is withdrawn and the epic ships
as uniformity only. The uniformity half stands on FC-1/FC-4/FC-5, which do not depend on it._ That
is what happens. **The condition is not re-read, the bar is not moved, and the judging point is not
deferred to a later milestone** — the last of those is the tempting one, because §3 below shows the
dominant term belongs to M4, and taking the measurement again after M4 in order to get a better
answer is precisely the move ADR-0143 names.

Nothing built in M3 is withdrawn or reverted. It is a real 32 px and a tenth row on the densest
screen in the estate, and the relocation is correct on its own terms. What is withdrawn is the
epic's **claim** to density as an outcome, and any later milestone justified by it.

---

## 2. Why the derivation was wrong: a disclosure is not free

The bar of ≥ 100 was derived against 128 px — _"two description paragraphs … ~3 lines each,
`6 × 20 px` of line-height plus two `mt-1` margins"_. The prose was correctly costed. **What the
derivation omitted is that the thing replacing it also has a height.**

Measured on the audit log:

|                                          | Before       | After                     |
| ---------------------------------------- | ------------ | ------------------------- |
| Title                                    | 36 px        | 36 px                     |
| Page description                         | —            | **40 px** (2 lines)       |
| Two coverage paragraphs                  | **≈ 100 px** | — (behind the disclosure) |
| `What this records` summary + its margin | —            | **32 px**                 |
| **Prose block total**                    | **≈ 108 px** | **≈ 72 px**               |

**The affordance costs 32 px — most of a third of the block it hides.** On a screen whose prose was
~108 px, a disclosure can save at most ~76 px and did save 36.

**And M1 took 20 px of that back.** The page description is capped at `max-w-prose` (546 px), which
is what made FC-1's "one description measure" pass structurally rather than coincidentally — and at
546 px the audit log's one-sentence description wraps to **two** lines where it would be one at the
1104 px measure it had before. So this epic's uniformity fix and its density fix are in direct
tension on exactly the screen the density half was aimed at. **Neither is wrong; nobody had costed
them together.**

---

## 3. What the chrome is actually made of, and why ≤ 80 was never reachable from prose

`m3-stack.json`, at 1646, measuring every child of the page frame above the first row:

| Screen    | header | disclosure | filter bar + `thead` | first row |
| --------- | ------ | ---------- | -------------------- | --------- |
| clients   | 36     | —          | **37**               | 172       |
| resources | 36     | —          | **97**               | 268       |
| calendars | 36     | —          | **125**              | 296       |
| audit-log | **76** | **32**     | **175**              | 382       |

Audit-log's excess over clients is **210 px**, of which:

- **138 px is the filter bar** — the single largest term, on three of the five screens, and
  **M3 does not touch it**. It is M4's subject.
- 40 px is the two-line description (§2).
- 32 px is the disclosure.

**Clients has no filter bar at all**, which is why it sits at 172 and why a spread of ≤ 80 across
these five was not reachable by editing prose — and would not have been reachable even if every
paragraph on every screen had been deleted outright. The condition's derivation reasoned about the
term it was looking at rather than about the total it constrained. Recorded here as a fault in the
condition, **not** as a reason to relax it after the fact: the withdrawal stands.

M7 will **raise** clients' chrome by adding the filter bar it lacks (spec §7), which is a capability
the product owner chose knowing the cost. It closes the spread from the wrong end, and it is not
counted as progress against a withdrawn condition.

---

## 4. What M3 did build

- **The coverage rule is relocated, never cut.** It is the one fact on the audit log a reader cannot
  infer, and it went wrong twice in opposite directions before reaching its present wording. It sits
  behind `What this records` and stays `aria-describedby`-linked to the list, so it is not a fact you
  have to find — it is a fact you no longer have to scroll past.
- **`my-activity`'s security caveat stays visible**, and only its coverage paragraph moves. Burying
  "what a _Not signed in_ row does and does not prove" behind a press was named the riskiest single
  change in the epic and was declined. There is now a test asserting it is **not** inside a
  `<details>`, because without one a later tidy-up would make that change silently.
- **`aria-describedby` now carries a list** on `my-activity` — the coverage rule and the caveat
  answer different questions. That turned an existing assertion red: it read
  `getElementById(describedBy)`, which returns `null` for a two-id list, so the **test** failed while
  the screen was correct. Fixed to resolve the list, with the reason recorded in place.
- FC-1 and FC-3 are unchanged by M3: `h1.top` still two values, no table narrower than after M2.

### Three false starts, all in the test rather than the product

Worth recording because each looked like a product defect for a minute:

1. The description assertion asked the **`<table>`**; `DataTable` puts `aria-describedby` on the
   scroll **region**.
2. Re-pointed at the region, it found none — an **empty** list renders the empty state instead, and
   the fixture returned `[]`.
3. Given a row, it still ran against the loading state, because `DataTable`'s pending skeleton **is
   a `<table>`** (the shape is known, so a skeleton beats a spinner) and `getByRole('table')`
   resolved before the data arrived.

The assertion now locates the target from the disclosure's **own id** and asserts that something
points at it, which is the claim rather than a proxy for it. **Verified red** by removing the
`describedById` wiring.
