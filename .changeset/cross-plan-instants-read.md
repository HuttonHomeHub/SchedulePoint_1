---
'@repo/api': minor
---

Linked plans now give the dates the same logic gives in one plan. Where two plans meet at a milestone next to weekend work, or at work that finishes part-way through a day, the downstream work starts when the upstream work actually hands over, and the upstream work keeps the float it has in one plan. Some downstream dates move earlier and some upstream work regains float. One case moves later: a hand-placed finish milestone upstream now hands over at the end of its typed day, as it does in one plan. Linked plans are recalculated once, upstream first, when the update starts, so the corrected dates appear without anyone pressing recalculate.
