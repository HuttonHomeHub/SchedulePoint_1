# Landing D1 M0 — what the organisation nav is actually worth

**Date:** 2026-08-19 · **Harnesses:** `measure-toolbar/vertical-stack.spec.ts` (re-run) and
`measure-toolbar/menu-band.spec.ts` · **Verdict: PROCEED — and the stated rationale was wrong.**

Taken under the rule CLAUDE.md §19.10 gained the same day: **re-verify a spec's problem statement,
not only its design.** It has now changed three decisions in one session.

## The two corrections

**1. The nav is 540 px, not 637.** Three figures were in circulation for one measurement — 637
(`screens.md` §0, CQ-G), 620 (`m4-vertical-stack.json`, before today) and ~517 (ADR-0092 M5) — and
all three predate ADR-0098 M5 removing the **Overview** item this morning. Re-measured now:
**540 px** at 1646. Removing that one link cost 80 px, which is most of the gap between the two
larger figures.

**2. The header is not "the scarcest width in the product".** CQ-G's headline says freeing the nav
frees 637 px _of the scarcest width in the product_. Measured, the app header at 1646 uses **935 px
of 1646 and has 711 px free** — 43 % spare. The scarcest width in this product is the **plan
command band**, which the Landing C measurement put at **27 px** of slack the same day, and the
organisation nav is not in it.

So the sentence is false as written. **The correct argument is better**, and it is the one ADR-0092
M5 already implied without a number against it.

## What the nav actually buys: the band merge

ADR-0092 M5 wanted the plan identity line folded into the app header, and **withdrew it** — "134 px
short at 1646" — noting that closing it would cost the organisation nav. That is now costed.

| width | header free today | free if the nav leaves | tidied identity content | spare    |
| ----- | ----------------- | ---------------------- | ----------------------- | -------- |
| 1440  | 505               | 1045                   | 795                     | **+250** |
| 1646  | 711               | 1251                   | 795                     | **+456** |
| 1920  | 985               | 1525                   | 795                     | **+730** |

**Without** the nav leaving, 1646 is 711 against 795 — **84 px short**, which corroborates
ADR-0092 M5's independently-derived 134 px within the difference the Overview removal explains.
**With** it, the merge closes at every width measured, including 1440.

"Tidied identity content" is the plan name (227) + status badge (46) + the mode cluster (412) + the
pen button (110) = **795 px**, measured. The breadcrumb **path** (455 px) is what tidying drops, and
ADR-0092 M0 already established the pen badge and its live-region sentence as 223–257 px of pure
redundancy beside a button reading `Stop editing`.

## The short-name trap, avoided for the third time today

`vertical-stack.spec.ts` creates its fixture plan as **`Logic`** — five characters. So does
`item-widths.spec.ts`. The plan-name crumb measures **37 px** there and **227 px** for
`Riverside — Phase 2 Substructure`, an ordinary construction plan name and shorter than many.

That 190 px is not a rounding error: it is what reversed the Landing C verdict from PROCEED to
WITHDRAWN four hours earlier, and it is why the identity figure here is taken from the menu-band
harness (realistic name) rather than from the vertical-stack one (`Logic`), even though the header
figures come from the latter. The two agree to within a pixel once the correction is applied —
1121 + 190 = 1311 against a directly measured 1310 — which is the corroboration that makes mixing
them safe.

**The remaining fixtures should be renamed.** Two of this repository's four measurement harnesses
still measure the one term a documented risk is about at that term's most favourable value.

## Falsification condition, for the record

Written here because D1 did not have one and Landing C's is the reason this session has any
credibility about widths: **if the tidied identity content does not fit the freed header row at
1440 with ≥ 120 px of slack, the merge half of D1 is withdrawn and D1 ships as the navigation change
alone.** Measured: **+250 px at 1440.** It clears.

D1 therefore proceeds as scoped — one navigator instead of two, **and** the band merge ADR-0092 M5
withdrew — with the prize stated correctly: not "the header is cramped", but "the nav is exactly
what the merge costs, and there is 250 px to spare at the narrowest width we hold to".
