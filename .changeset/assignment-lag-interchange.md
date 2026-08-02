---
'@repo/interchange': minor
'@repo/api': minor
---

Report the per-assignment join lag as an interchange gap instead of losing it silently.

A join delay authored in SchedulePoint (ADR-0071) has no counterpart in any interchange format this
repository has verified, so an export cannot carry it and an import cannot recover one. That was
already true before this change — what was missing is that nobody was told.

The canonical model now carries `lagMinutes` on an assignment, and both halves of the asymmetry are
stated in the `InterchangeReport`:

- **Export** knows exactly what is lost, so it reports a `drop` finding **only when** assignments
  actually carry a delay, counting them.
- **Import** cannot know whether the source file held one, so it reports the gap **unconditionally**
  whenever a file brings assignments at all — for XER, that P6's own export was checked and carries
  no such field; for MSPDI, that no equivalent has been verified.

The ADR-0050 mapping-contract table moves in lock-step. No schedule dates change: `lagMinutes` is
read by no parser and written by no emitter, deliberately, and the CPM engine is not involved.
