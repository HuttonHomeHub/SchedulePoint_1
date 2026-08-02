---
'@repo/api': minor
'@repo/web': minor
'@repo/types': minor
'@repo/seed-http': patch
---

Report a four-hour remainder, instead of rounding it to "no work left"

ADR-0070 made an activity's **duration** sub-day authorable and left its **remaining work** a
whole-number days box. So a planner could type `4h` for the duration, report progress, and then
state the remainder only as `0` or `1` day — and on an incomplete activity `0` is not a rounding
artefact, it is also the value that means _no work left_. The asymmetry sharpened it: the derived
remaining (percent × duration) is minute-exact, so stating the remainder explicitly was **less**
precise than saying nothing (surface audit F3).

`remainingDurationMinutes` joins the progress DTO as the mutually-exclusive sibling of
`remainingDurationDays` — the same pair `api-v0.34.0` gave duration and lag — and the activity
response and `ActivitySummary` now carry it, so a sub-day remainder can be read back exactly rather
than as the `0` its day field rounds to.

The progress editor's field takes the same `d`/`h`/`m` grammar as a duration, reusing that field's
predicate, degrade rule and flag rather than a second reading of `2d 4h`. Blank still means "derive
it from percent complete" — which is the one thing this field has that a duration does not, and the
only part the shared module does not own. Where the calendar's working hours cannot be resolved it
degrades to whole days, which is the same code path as flag-off, so the rollback contract and the
not-yet-loaded state cannot rot apart.

The seeder now sends the minutes its spec already held, instead of rounding them and recording the
loss as an approximation — a sub-day remainder in a seeded plan was never what the spec asked for.

With this, `pnpm check:surface-contract` reports **zero gaps**: every writable field on a scheduling
DTO and every CPM engine input has a surface a planner can reach, or a written reason why not.
