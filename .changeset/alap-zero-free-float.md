---
'@repo/api': patch
---

ALAP zero-free-float refinement (M6-F5, ADR-0035 §11). An activity flagged As-Late-As-Possible is now
placed as late as its successors allow, so its **`freeFloat` is 0** — the machine-readable signal of that
placement — while its pure `earlyStart`/`lateStart`/`totalFloat` stay untouched (display-only, per §11).
An open end with no successors falls back to its late dates. Completes the M4 ALAP flag with the
free-float pass, flipping the `con_alap` and `float_zero_free` capability rows to supported.
