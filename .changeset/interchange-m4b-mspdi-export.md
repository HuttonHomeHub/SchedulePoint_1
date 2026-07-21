---
'@repo/interchange': minor
'@repo/api': patch
---

feat(interchange): MS Project MSPDI export serialiser + format-agnostic export dispatch (ADR-0050 M4b)

Proves, in reverse, ADR-0050's claim that "a format is a serialiser, not a second pipeline": the **same**
canonical export model the M4a XER path serialises now also serialises to a valid Microsoft Project **MSPDI**
`.xml`. Adds to the pure `@repo/interchange` package:

- `mspdi-emit.ts` — the canonical → MSPDI `<Project>`/`<Calendars>`/`<Tasks>`/`<PredecessorLink>` element
  emitter (the inverse of the MSPDI adapter): activity type → `<Milestone>`/`<Duration>`, working-minutes →
  ISO-8601 `PT#H#M#S`, relationship type → link `<Type>` (`0=FF, 1=FS, 2=SF, 3=SS`), minutes lag →
  tenths-of-a-minute `<LinkLag>`, canonical calendar → `<WeekDays>/<WeekDay>` (`DayType` 1=Sunday…7=Saturday,
  `<WorkingTimes>`, `<TimePeriod>` exceptions). WBS summaries, constraints, progress, ALAP and
  resources/assignments are **dropped and reported** (M4c) reusing the XER emitter's finding shapes.
- `mspdi-serialiser.ts` — serialises the element tree to UTF-8 XML bytes with the MS Project namespace + an
  XML declaration. All leaf text is XML-escaped (`& < > "`) so untrusted plan text can never break or inject
  structure; the output re-parses through the real `fast-xml-parser`-based `parseMspdi`.
- `export-mspdi.ts` — the `exportMspdi` orchestrator (validate → limit → map → emit → serialise → report),
  reusing the shared graph-size ceilings and the format-agnostic `mapExportGraphToCanonical` unchanged.
- `export-schedule.ts` — `exportSchedule({ graph, format })` dispatch (`xer` | `mspdi`), the write-direction
  mirror of `importSchedule`, so the caller stays format-blind.

The CPM engine and its recalc parity golden suite are untouched (export never invokes the engine).

The `@repo/api` export endpoint (`GET …/plans/:planId/interchange/export/:format`) now accepts
`format = mspdi` (streamed as `application/xml`, `<slug>.xml`) alongside `xer`, via `exportSchedule`. The
OpenAPI `format` enum and the 422 unsupported-format message are updated; everything else is identical.
