# M0-T2 — The mode divider, measured

**Run 2026-08-30**, Chromium, `apps/web/measure-toolbar/m0-mode-divider.spec.ts`, output
`apps/web/measure-output/m0-mode-divider.json`. The verdict rule was committed **before** this ran
(`falsification.md`, its own commit).

**Fixture:** plan name `Riverside Quarter — Phase 2 Substructure` (41 chars — the VOID condition on a
short name is met), a real client/project crumb, two seeded activities, recalculated, **pen held and
re-taken after the recalculation's reload**. Baseline and candidate read in **one session against one
fixture**, with the baseline read a second time after the injection was removed.

---

## Verdict: **PROCEED with the divider**

Quoting `falsification.md` rather than paraphrasing it:

> 1. at **1646** and **1920** the live header row is **one line** with the candidate chrome present

**PASS.** 1920: 40 px / 1 line, baseline and candidate. 1646: 40 px / 1 line, baseline and candidate.

> 2. `aboveCanvas` with the candidate **equals** `aboveCanvas` without it at 1646 and 1920 — an
>    equality, not a bound

**PASS, as an equality.** 228.0 px in every one of the six readings at those two widths (baseline,
candidate, baseline-again).

> 3. at **1440** and **1280**, `aboveCanvas` does not grow

**PASS.** 326.0 px, baseline and candidate, at both widths.

> 4. the mode cluster is **one line** at every measured width

**PASS.** 36 px / 1 line in all eight readings.

---

## The figures

| width | container | `headerRowRequired` base → cand | `perOccupant.mode` base → cand | header `lines` base / cand | `aboveCanvas` base / cand |
| ----- | --------- | ------------------------------- | ------------------------------ | -------------------------- | ------------------------- |
| 1920  | 1888      | 1494 → **1507**                 | 443 → **456**                  | 1 / 1                      | 228.0 / 228.0             |
| 1646  | 1614      | 1494 → **1507**                 | 443 → **456**                  | 1 / 1                      | 228.0 / 228.0             |
| 1440  | 1408      | 1494 → **1507**                 | 443 → **456**                  | 2 / 2                      | 326.0 / 326.0             |
| 1280  | 1248      | 1494 → **1507**                 | 443 → **456**                  | 2 / 2                      | 326.0 / 326.0             |

**Delta is +13 px at every width**, matching the predicted `ml-1 border-l pl-2` = 4 + 1 + 8 exactly.
The baseline re-read after removing the injection returned 1494 / 443 / 228.0 / 326.0 at every
width — identical to the first reading, so the harness did not perturb what it measured.

**The header is already two lines at 1440 and 1280 in the BASELINE**, and that is ADR-0112 D4 working
as designed rather than a finding: the row wraps below a measured 1480 px container, and 1408 is
below it. The candidate does not move that boundary — `headerRowRequired` 1507 is still far above
1408, so the row was wrapping before and wraps by the same amount after.

---

## The instrument was wrong on its first run, and that is the useful part

The first run reported **+5 px against a predicted +13**, at every width.

It would have been easy to write that up as a discovery — "the divider is cheaper than the arithmetic
says" is a pleasant sentence, and 5 px passes every rule above just as 13 does, so **the verdict would
have been identical and the number in this document would have been wrong.**

The cause was the injection, not the layout. The first version applied the three properties to the
`Diagram` **button**; `Toolbar.tsx:199` applies them to the `role="group"` **div**. On a control that
already carries `px-2`, an inline `padding-left: 8px` **replaces** its padding rather than adding a
group's, so only the 4 px margin and the 1 px border survived. The candidate is now a real second
`role="group"` wrapper around `[view-tsld, view-gantt]`, built to match `Toolbar.tsx:191-200`, with
the pair moved inside it — which reproduces the two effects a split actually has and an inline style
cannot: the new group's own `gap-1` governs the space between the two view items, and the 8 px lands
outside the buttons.

It was caught by two things, both cheap and both deliberate: **the delta disagreed with a prediction
that had been written down first**, and the probe prints the text of the node it touched (it read
`Diagram`, not `Diagram | Gantt`). That is the check `m1-merged-probe.spec.ts` records missing three
times in one file — caught here on the first run because the harness was built with its docblock in
front of me.

**One qualification on this document's own numbers.** The candidate is an injected approximation, not
the shipped markup. M3-T4 re-measures against the real build; a divergence there is the finding, and
this paragraph is why it will be legible as one.

---

## What this changes about the epic

**Q2's WITHDRAW branch is not exercised.** The product owner pre-approved shipping the accessible
names alone if the divider cost a line; it does not, so **both halves ship** and `#201` closes
completely rather than half.

Worth noting against the run of eight consecutive contradicted width expectations on this surface
(ADR-0090 M4 → ADR-0115): this one held. The honest version is narrower — the _prediction_ was
contradicted once, by my own instrument, and held once the instrument was corrected. The prior that
13 px on this row is not free turned out to be wrong here for a specific reason: the row's slack at
1646 is **120 px** (1614 − 1494), which is an order of magnitude more than the change, and the two
widths where slack is negative were already wrapping.
