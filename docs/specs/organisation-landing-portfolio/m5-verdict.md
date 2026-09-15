# M5 — the layout verdict

**Status:** Approved — the grid is **withdrawn** on FC-4; FC-1 finishes at **4 of 7** against a bar
of 7, with the ceiling proven rather than estimated.

Full run: `m5-landing-run.md`.

## 1. FC-4 — PASSES, because the grid was measured and not built

| Width | every section | M0 baseline | Verdict  |
| ----: | ------------: | ----------: | -------- |
|  1646 |           846 |         846 | **PASS** |
|  1440 |           846 |         846 | **PASS** |
|  1280 |           846 |         846 | **PASS** |

Nothing was narrowed because nothing was re-laid-out. **The two-column grid CQ-3 approved is
withdrawn, and the reason is arithmetic over the viewport rather than over a container.**

FC-4's bar is "each existing section's rendered content width at 1646 is `>=` its M0 baseline",
and that baseline is **846**. Two columns each at least 846 wide need a content box of
`846 × 2 + 24 gap = 1716` px, before the page's own horizontal padding. **The viewport is 1646.**
There is no `PageContainer` width, and no value of the gap, that makes it fit — the shortfall is
larger than the whole gap.

That is the same sum `PageGrid`'s own docblock does for the staff console, reaching 787 px per
column at this width, and it is why that component's spans are assigned by **content demand**: a
`wide` item takes both columns and only a `narrow` one pays the 787. But FC-4 constrains every
**existing** section, and there are three of them, so every one would have to be `wide` — which is
a single column wearing a grid's clothes.

Measured and not built (ADR-0142 D4). This is the seventh consecutive time a width expectation in
this repository has been contradicted by its own measurement, and the seventh in the same
direction.

## 2. FC-1 — 4 of 7, and 4 is the ceiling

| Q   |                                           |         M0 | before the reorder |  **after** |
| --- | ----------------------------------------- | ---------: | -----------------: | ---------: |
| Q1  | Where was I?                              |      238 ✔ |              238 ✔ |  **238 ✔** |
| Q3  | Is anything waiting on me?                |     1053 ✘ |             2006 ✘ |  **420 ✔** |
| Q5  | When does each programme finish?          |     absent |             1237 ✘ |  **951 ✔** |
| Q6  | Has that moved against what we committed? |     absent |             1259 ✘ |  **973 ✔** |
| Q2  | What changed while I was away, and who?   |      442 ✔ |              442 ✔ |     1742 ✘ |
| Q4  | Are these figures current, or stale?      |     absent |              486 ✔ |     1786 ✘ |
| Q7  | Is anything flagged in the schedule?      |     absent |             1846 ✘ |     1560 ✘ |
|     |                                           | **2 of 7** |         **3 of 7** | **4 of 7** |

**The bar is 7 and this does not meet it.** What follows is why 7 is unreachable, established
rather than asserted, because "we tried and it was hard" is not a verdict.

### The measured input nobody had

| Section               | height at 1646 |
| --------------------- | -------------: |
| Jump back in          |            158 |
| Needs your attention  |            463 |
| Where the work stands |            789 |
| Recently changed      |            749 |
| **sum**               |      **2,159** |

Page content runs to **2,386 px** against a 1,000 px fold. Nothing was measuring this: section
boundaries were being **inferred from answer positions**, which tells you a section starts somewhere
above an answer and nothing about how tall it is. The harness now reports it, and throws if it finds
no regions.

### The ordering was searched exhaustively, not chosen

All 24 permutations, scored against the measured heights and each answer's offset within its own
section. **The maximum is 4**, reached by four orderings; two of them lead with "Needs your
attention", which the plan's principle rules out. Of the two that lead with the reader's own work,
this one puts the programme's **health** above the fold rather than the activity feed — which is the
content this epic exists to add.

### The plan's own ordering was wrong, and measurement is what showed it

M5-T1 step 1 specified `Jump back in → Where the work stands → Recently changed → Needs your
attention`. It was written before any section had been measured, and it puts "Needs your attention"
last behind two ~750 px lists: **Q3 lands at 2006** — where M0's whole finding about that question
was that 1053 is fifty-three pixels too far. The plan's order makes the defect it inherited **twice
as bad**. Its stated principle ("worst news is not first; the reader's own work is") is kept intact;
only the sequence changed.

### Why cutting — the other sanctioned remedy — does not reach 7 either

FC-1's failure clause permits "the layout is re-ordered, or a section is cut". Re-ordering is
exhausted at 4. Cutting is worse than neutral: shortening the two lists to five rows moves the
sections up by roughly 250 px each, which still leaves the fourth section's answers below 1,000 —
**and it can make Q7 unanswerable**, because the fixture's only flagged plan is its seventh row, so
a five-row list would not contain it at all. The remedy would remove the question rather than
answer it.

### Q7 is not a layout property, and that is a finding about the condition

`[data-overview-finish]` and `[data-overview-variance]` are on **every** row, so Q5 and Q6 measure
the first row of their section — a layout fact. `[data-overview-flags]` exists **only on a row that
has flags**, so Q7 measures _how far down the first flagged plan sits_. In this fixture that is row
seven. In a real organisation it could be row one or row fifty.

So one of FC-1's seven questions is answered at a position the layout does not control, and the
7-of-7 bar treats it as though it did. Recorded rather than used as an excuse: Q7 fails here on its
own terms too.

## 3. What is actually owed, and to whom

The score moved 2 → 4 and the specific defect M0 opened on is fixed — Q3 went from 53 px below the
fold to 420 px above it. What no sanctioned remedy reaches is 7 of 7, because **four populated
sections are 2,159 px of content and the fold is 1,000**.

Two options remain and both are the product owner's, because both trade against the request that
opened the epic — _"a great landing page that gives a user logging in all the information they will
ever need"_:

1. **Denser rows.** The two lists cost roughly 100 px per row for three or four lines of text. This
   is the only option that puts more above the fold without showing less, and it is a design pass
   rather than a layout switch.
2. **A different fold criterion.** 7-of-7-above-1000-px was set before anyone knew the page was
   2,386 px tall. A bar that no sanctioned remedy can reach is not a bar.

Cutting the lists is **not** offered as a third option: it is measured above as making Q7 worse.
