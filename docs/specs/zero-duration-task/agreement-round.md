# Agreement round: zero-duration tasks (#384)

- **Status:** In progress. The spec and plan are folded once every reviewer has reported.
- **Delegated answer (product owner, 2026-09-26):** "go with the most robust options you consider
  correct and let the agents ratify them". CQ-1 = the date-keeping rule lives on the server, for
  every type-changing PATCH. The spec's other defaults stand.

## ux-reviewer: AGREE-WITH-CHANGES

Blocking:

- **U1: "nothing moved" is checkably false.** Across a non-working gap the converted finish
  milestone's glyph moves from Monday 00:00 back to the end of Friday (`milestone-day.ts`,
  ADR-0155 D8). Every unqualified "nothing moved" or "stays where it is" (the journey narrative,
  US-3, the M2-T2 editor hint) must instead:
  - name what is unchanged (the schedule instant, successors, float);
  - say at least once, in the dialog or the announcement, that a finish milestone is drawn at the
    end of its day and so may appear earlier across a weekend.

Suggested:

- When both shading reasons apply, the pen/role reason wins (the `GanttRowMenu` `STRUCTURE_ITEMS`
  precedent).
- The advisory is a separate `<section>` with its own heading, never an `<li>` in the metrics `<ul>`.
- One footer sentence: "found from stored durations, whether or not the plan has been calculated,
  and not part of the DCMA assessment above."
- The import-advisory string is the plan's version, with "convert it after import". The spec must
  match it.
- The offender note uses metric 10's phrase "no resource assignment".
- Surface `detail.resourced` in the section summary.
- The announcement's date format reuses or extends `formatCanvasDate`, never a third format.
