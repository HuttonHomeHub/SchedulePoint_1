---
'@repo/api': minor
'@repo/seed': minor
'@repo/seed-cli': minor
'@repo/seed-http': minor
---

Show a resource's join lag in the loading histogram

The histogram read-model built its input with a hard-coded `lagMinutes: 0` under a comment stating
that SchedulePoint does not model a per-assignment lag column. That column landed in the previous
change, so the comment was already false — it would have outlived the column by a milestone had the
findings register not named it. The repository now selects the stored lag and the caller passes it
through, measured on the same activity calendar the span is.

The seed catalogue closes the matching gap. `res_assignment_lag` was one of the two capabilities
`seed --coverage` reported as **excepted** with the reason "an assignment has no lag field: work
starts with its activity" — true of the data model at the time and badly underselling the position,
since the engine half was already built and tested. That exception is deleted and the key is now
**reached** by `A_LAG` in `plan:capability-resources`: a twin of `A_BELL` differing in exactly one
thing, so the two histograms are a controlled contrast rather than two unrelated pictures.
`docs/TEST_PLAYBOOK.md` says what right and wrong look like for the pair, and the fixture's
`assignment_lag_h` now maps into the seeded plan instead of being dropped.

Two tasks the plan asked for were **not** built, because measuring their premises showed both to be
false, and both are recorded in the plan rather than quietly skipped. A typed "lag unreachable" error
mapped to a 422 was written and reverted: the working-time port does not throw for any legal lag — a
calendar working one minute per week walks the full ten-year ceiling and returns a date in the year
102,759 — so the `catch` would have been permanently dead code carrying a docblock asserting a defect
that does not exist. And the N34 hostile cases do not belong in the seed negative tier, which is
pinned to the conformance fixture's own case list; they live at the DTO boundary and in the API e2e,
where they run.

**The CPM engine is not modified and the ADR-0034 recalculation parity gate is untouched** — the
histogram is a read-model and `computeSchedule` has never seen an assignment.
