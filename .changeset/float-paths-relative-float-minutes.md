---
'@repo/api': minor
'@repo/types': minor
---

Report float-path relative float in working **minutes**, and say when the list was truncated.

`GET …/schedule/float-paths` divided the engine's working minutes by a flat 1440. Total float is
measured on the **activity's own** calendar (ADR-0037 §4, ADR-0068), so on an eight-hour calendar one
working day of relative float — 480 minutes — rounded to **0**, indistinguishable from the driving
path, and larger figures were understated threefold. Six working days read as "2 days".

Nothing consumed the field, which is the only reason it never bit; the audit's F8 had named this
exact conversion as unchecked. Building a surface for it is what would have made it bite, so the fix
lands first and on its own.

- **`relativeFloatMinutes`** carries the engine's figure with no conversion. Convert for display
  against the calendar you are presenting on — never against a flat 1440.
- **`relativeFloat`** (days) is retained and deprecated rather than removed: deleting it breaks any
  existing reader for no gain. Its description now states the arithmetic that makes it wrong.
- **`hasMorePaths`** on the envelope, so a reader can honestly say "the first N" instead of implying
  the list is every path into the target. Derived by asking the analysis for `maxPaths + 1` and
  slicing.

**The CPM engine is not modified** — `hasMorePaths` is a service-level probe rather than a new engine
field, and a structural test now fails CI if `computeSchedule`'s or `computeFloatPaths`'s signature
moves. The ADR-0034 recalc parity gate is untouched, and the existing engine goldens pass unedited.

The unit is pinned by an API e2e on a real eight-hour calendar, built as a twin of the existing
24-hour case so the two differ in exactly one thing.
