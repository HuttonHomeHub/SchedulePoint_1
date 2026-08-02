---
'@repo/web': minor
---

Turn the per-assignment **join lag** on by default (`VITE_ASSIGNMENT_LAG`), and fix what the
enablement gates found.

A join delay — how far into an activity a particular resource actually arrives — has scheduled,
loaded, levelled and earned correctly since ADR-0071 M0–M3, and until now nothing in the product
could set one. It is now a "Joins after" field on the assign form and on every assignment row,
reading the `d`/`h`/`m` grammar against the **activity's own** calendar.

Five defects the deferred specialist reviews found in code that had already passed a human read:

- **A compound duration was silently converted at the wrong factor.** With the activity's calendar
  not yet resolved, `2d4h` slipped past the day-check (which needed a space before the next unit)
  and was measured at a placeholder 24 hours a day — storing 3,120 minutes where 1,200 was meant,
  accepted, with no error shown. The check now tokenizes through the parser's own splitter, so the
  two cannot disagree.
- **The row's Save used the native `disabled` attribute**, which blurs focus to the page body twice
  per save. It is `aria-disabled` with a real click guard.
- **The assign form refused a day-denominated lag by doing nothing** — no error registered, nothing
  announced, no focus moved, and the Assign button still lit. It now reports the refusal the same
  way its sibling link form always has.
- **One entry route never received the day factor**, so the field there was permanently degraded:
  it rendered, looked right, and refused `2d` on a plan whose calendar was perfectly resolvable.
- **The placeholder offered `0d`** even while the label said the field could only take hours or
  minutes — an example in the unit it was about to refuse.

A flag-on journey (`apps/web/e2e-assignment-lag/`, its own CI step) proves against a real API, with
the pen enforced, that `1d` on an eight-hour calendar stores 480 minutes and not 1,440, that the
write is pen-gated, and that the optimistic version round-trips across two consecutive saves.

Rollback stays byte-for-byte: set `VITE_ASSIGNMENT_LAG=false`. Nothing persisted depends on the
flag, and the flag-off parity suite is kept as the contract.
