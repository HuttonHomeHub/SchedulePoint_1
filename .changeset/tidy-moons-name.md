---
'@repo/api': minor
'@repo/web': minor
---

fix(api): the staff diagnostics sentence names the unit each question counts

Two of the eleven registry entries do not count activities — `visual-placement-plans` asks
`FROM plans`, `baselines-over-placed-plans` asks `FROM baselines` — and the sentence beneath every
row said "activities" regardless. On the one screen whose whole purpose is to give a count its
denominator, the denominator was described wrongly for two of the questions
(`docs/TECH_DEBT.md` #362).

The registry entry now carries a `unit`, a closed literal union (`activity | plan | baseline`)
served on the row beside `id`, `label` and `nature`. A closed union rather than a free-text noun
pair keeps the structural gate able to tell a registry literal from a value somebody interpolated,
and the web renderer maps it through a total record so a fourth grain is a typecheck failure rather
than a silent fallthrough.

The "across N plans" clause is withheld when the unit IS a plan, where that count can never differ
from `affected` and therefore reads as information without being any.
