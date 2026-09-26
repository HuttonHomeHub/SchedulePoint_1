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

## security-reviewer: AGREE-WITH-CHANGES

Checked and confirmed:

- **PATCH path.** Org scope, `assertHoldsPen` and optimistic `version` apply. D4 is not an
  escalation, because the server computes fields the caller could already send.
- **Staff diagnostics.** They fit ADR-0140 S-1 to S-5.
- **Health advisory.** It passes G4 (`compute-health.ts` is scanned) and G1 (the 14 metrics are
  untouched).
- **Audit census.** "No new route, so no census change" holds.

Blocking:

- **S1: D3's rewrite can persist an external-date pair that violates N26.**
  - `assertExternalDatesOrdered` (`activities.service.ts:220-233`, called at `:510`) checks the
    **pre-rewrite** effective pair. D3 then shifts only the unsent member.
  - Example: a TASK with duration 0, early = late = Jan 10, and
    `PATCH {type: FINISH_MILESTONE, externalEarlyStart: Jan 10}` persists late = Jan 9 < early.
  - That is a state the caller could not write directly. The mirror image over-rejects valid
    requests.
  - Fix: compute the re-expression before the ordering check, and validate the values that will be
    persisted.
  - Test both directions with exactly one of the pair sent, verified red against the current
    ordering.

Suggested:

- `reexpressZeroDurationDates` no-ops on a null stored field. Add that as an explicit unit case.
- Record in M2-T1's risks that the constraint-date pair has no value-ordering check at the API, so
  N26 is specific to the external pair.
- Add both new ids to `DIAGNOSTIC_IDS`. The diagnostic, the health note and `makeMilestoneGate`
  must agree on what a "live" resource assignment is (`deleted_at IS NULL`).
- The wire-shape DTO for `advisories` lands in `plan-health-check.dto.ts`, which G4 scans, not only
  in the `@repo/types` interface.
- ADR-0162 should say why the conversion PATCH stays `PLAN_CONTENT` and does not cross ADR-0073's
  blast-radius test the way `activity.reparented` did.
