---
'@repo/web': minor
---

The organisation landing lays out in two columns and uses the width it has.

`/orgs/:slug` rendered inside `PageContainer width="narrow"` — `max-w-4xl` (896 px) less its padding
= **846 px of content, at every viewport**. Measured, that is 846 px at 1280, 1440, 1646 **and
1920**: widening the browser by 640 px changed nothing and the surplus became empty gutter, roughly
650 px of it on a 1920 screen, beside rows still as wide as the measure rule was introduced to
narrow. The four sections now sit in a 2×2 `PageGrid` inside `PageContainer width="wide"`.

Measured before and after in one sitting on one fixture, so the spread is a property of the change
rather than of the machine: questions answered above the fold **4 → 6 of 7** at both 1646 and 1920,
page content height **2,386 → 1,451 px (−39 %)**, sections 730 px at 1920 and 647 at 1646. The one
request the landing makes is unchanged.

**The sections are deliberately narrower than they were, and that serves the rule the single column
was protecting rather than breaking it.** ADR-0098 chose `narrow` because a plan's name and its
timestamp sat ~800 px apart; in two columns they are closer together than `narrow` ever made them.

**What this reverses.** The epic withdrew this grid on a falsification condition reading "no section
narrower than its 846 px baseline" — which two columns cannot satisfy inside an 846 px container, at
any width, on any monitor. The condition was amended rather than waived, and the amendment is the
finding: a remedy is measured before it is built, and so is the **constraint**. It also retires a
claim that four-of-seven above the fold was the proven ceiling; that search was over a single-column
stack.

Q7 ("is anything flagged?") is still below the fold, because a flagged plan can sit anywhere in a
list ordered by movement — a content decision, named rather than chased. At 1280 the columns are
464 px and the rows are cramped; both of the screens this was raised about are ≥ 1646, and the cost
is filed as `docs/TECH_DEBT.md` #333 with the reason the two obvious remedies are wrong.
