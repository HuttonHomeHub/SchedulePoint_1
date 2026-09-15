---
'@repo/api': minor
'@repo/web': minor
'@repo/types': minor
---

Every row of the organisation landing's "Recently changed" now says whether its plan's figures are
current.

Three states, deliberately not one flag: a plan that has **never been calculated** reports a null
`scheduleComputedAt`; one **edited since** it was calculated reports `editedSinceCalculated`; and a
current plan renders nothing at all, because silence is the healthy state and a line saying
otherwise would claim more than the check can know.

It costs no extra query — one more column on the read that already runs, compared against the
`GREATEST(plan, newest activity, newest dependency)` that read already computes.
