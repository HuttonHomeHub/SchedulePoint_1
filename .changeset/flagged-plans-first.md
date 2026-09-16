---
'@repo/api': minor
---

"Where the work stands" puts flagged programmes first, so a broken constraint is the first thing the
landing says rather than the sixth.

The section borrowed its order from "Recently changed" — deliberately, with a written argument that
"a second ordering rule would be a second opinion about which work matters most". That treats a
borrowed rule as a neutral one, and it is not: recency is **intrinsic** to the section answering
_what happened and who_, and merely **inherited** by the section answering _is the programme
healthy_. So the only place on the landing reporting programme health had no say in what its reader
saw first, and the one plan with a broken constraint sat under five healthy ones that happened to
have been touched more recently.

Measured before and after in one sitting on one fixture: the flag moves from **y = 1398 to 831** at
1646, and **1378 to 811** at 1920, against a 1,000 px fold — so the landing now answers **all seven**
of the questions it claims to, at both widths, for the first time since that condition was written.
Page height, both sections' geometry, every measured section width and the single `…/overview`
request are **identical** either side: the change reorders at most eight rows and costs no layout.

The rank is a **boolean**, not a count or a severity — a plan with four visual conflicts is not more
urgent than one with a broken constraint, and the flag kinds are not comparable — and the sort is
stable, so within each group the recency order survives untouched. The order is now stated on the
`planStanding` DTO, because it is a contract a consumer could reasonably rely on.

The two sections now disagree about order where a reader can see both at once, which the two-column
landing made visible. Accepted: they answer different questions, and matching orders bought
agreement by making one of them answer neither.
