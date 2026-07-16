---
'@repo/api': minor
'@repo/web': minor
'@repo/types': minor
---

Mandatory constraints now **produce-and-flag** instead of being silently parked (M4-F2, ADR-0035 §7).
`MANDATORY_START`/`MANDATORY_FINISH` still pin their date with the same MSO/MFO arithmetic, but when a
pin drives an activity earlier than its logic allows the engine now **produces the (impossible)
schedule as pinned and flags it** — a new engine-owned `constraintViolated` boolean on each activity —
surfacing the broken relationship as negative float on the predecessor, and never repairing it. A pin
the network can satisfy is not flagged.

The schedule summary's dishonest `parkedConstraintCount` is **replaced** by two honest counts:
`constraintViolationCount` (mandatory pins that broke logic) and `constraintWarningCount` (the N15 case
— a Start-No-Earlier-Than dated before the data date, honoured but unable to pull work back). The
recalc response, read summary, and structured recalc log all carry the new counts; the summary strip
shows "Constraint conflicts" / "Constraint warnings" figures with accessible explanations in place of
the old "Parked constraints" figure. Plans with no mandatory constraints are byte-identical (the
golden suite is unchanged) and report both counts as zero.
