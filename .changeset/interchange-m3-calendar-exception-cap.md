---
'@repo/interchange': patch
---

Bound the total number of dated exceptions a single MSPDI `<Calendar>` may
accumulate (`MAX_CALENDAR_EXCEPTIONS`, enforced during accumulation and failing
closed with a reported drop). The existing per-range day bound stopped one
hostile `<TimePeriod>`, but a file could pack many maximal ranges to amplify a
small upload into millions of exception objects — an unbounded memory
amplification reachable from the read-only dry-run. The importer now stays
memory-bounded regardless of input.
