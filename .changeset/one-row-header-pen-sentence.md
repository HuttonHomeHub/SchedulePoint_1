---
'@repo/web': minor
---

The pen's "who is editing this plan" sentence is now read in the plan's facts row, beside the
activity count and the project finish, instead of on the plan's identity line. Its badge and every
hand-off control — Start, Stop, Request, Take over, Override, Keep, Dismiss — stay beside the plan,
where the action belongs.

That frees 155 px on a row which, measured, had four pixels of headroom at 1280 px: any plan name
longer than a short one was already being truncated there. It costs no vertical space at any width,
measured before and after.
