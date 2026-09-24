# Conditions: layout interchange

Committed alone, before any code (M0-T0), verbatim from `feature-spec.md` §5. Nothing below may be
edited once a milestone is judged against it; a change is a new dated amendment section with its
reason.

## Decisions (product owner, 2026-09-24)

| Question                                   | Decision                                                                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| CQ-1 — does every XER export carry layout? | **A.** Always, with no new control.                                                                               |
| CQ-2 — MSPDI in this epic?                 | **A.** Later, as optional M5; not built in this programme.                                                        |
| FC-6 — can a real P6 open our file?        | **No P6 is available.** FC-6 is recorded as **unobserved** and is not a pass. No real P6 XER with a UDF supplied. |

## Falsification and acceptance conditions

Committed **alone, before any code** (M0-T0, ADR-0128's ordering). Each names its instrument.

| #    | Condition                                                                                                                                                                                                                                                                                                                                                                                                      | Instrument                                               |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| FC-1 | **NetPoint XER round trip:** for every activity, `visualStart`, `laneIndex`, `visualEffectiveStart`, `visualEffectiveFinish` and `visualConflictReason` equal the source (58/58 placements per the brief, re-derived in M0-T1); project finish and the critical set equal the source. Compared by activity **code**, never by id.                                                                              | API e2e, seeded through the public API                   |
| FC-2 | **Foreign-file parity:** for every XER fixture the repository imports today, the import graph (JSON) is byte-identical to the M0 baseline, the report is identical except the one foreign-UDF `drop` line where the fixture has foreign UDFs, and every persisted column is identical — `lane_index` included, measured against the **post-M1** baseline.                                                      | pure golden + API e2e, baseline captured in M0 before M1 |
| FC-3 | **Edited-elsewhere file:** exported NetPoint XER mutated (a duration lengthened on the critical spine; a new `TASK` with no layout values; one `UDFVALUE` row corrupted) imports with **0** carried rows moved, the new activity in a row free at its drawn span, the conflict count reported equal to the engine's `visual_conflict` count among restored placements, and one `repair` for the corrupt value. | API e2e                                                  |
| FC-4 | **Namespacing:** a foreign XER carrying `UDFTYPE` rows with near-miss labels (`SchedulePoint layout v1: Row`, `…v2: row`, `SchedulePoint layout v1:row`) imports to a graph byte-identical to the same file without those rows; the `v2` case adds exactly one "newer version" `drop`.                                                                                                                         | pure unit                                                |
| FC-5 | **M1 (drawn span at phase 3):** after an import of each catalogue XER fixture, the server port of the web overlap predicate reports **0** overlapping activities. Today's count is measured first (M0-T4) — if it is already 0 everywhere, M1 still lands for the layout path and its commit says the defect was latent.                                                                                       | API e2e + M0 measurement                                 |
| FC-6 | **P6 tolerance — owed, not claimable by CI:** one exported NetPoint XER opens in a real P6 and schedules to the same finish. Recorded **observed** or **unobserved**; unobserved is not a pass and is written as such in the ADR.                                                                                                                                                                              | Product owner (CQ-1)                                     |
| FC-7 | **Export unchanged in scheduling content:** for the rich export fixture, every non-UDF table of the XER is byte-identical to the pre-epic output.                                                                                                                                                                                                                                                              | pure golden                                              |

## Amendment, 2026-09-24 (M4 review, before any file carrying the fields existed)

The row field's label is `SchedulePoint layout v1: lane`, not `… v1: row`. The UX review found the
import dialog, the report and the server's findings saying "row" while every canvas surface says
"lane" for the same `lane_index`. The label is the file format's identity and can never change once a
file carries it. No file did: the reader (M2) had not merged and the writer (M3) had not shipped. So it
was renamed then, and FC-4's near-miss cases read `… v1: Lane`, `… v1:lane` and `… v2: lane` for the
same reason they read `Row`, `:row` and `v2: row` above. No threshold, limb or verdict changes.
