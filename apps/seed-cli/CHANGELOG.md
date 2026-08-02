# @repo/seed-cli

## 0.1.0

### Minor Changes

- [#211](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/211) [`5acf551`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5acf551ee0891948440798a74662e40d9917b985) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Show a resource's join lag in the loading histogram

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

### Patch Changes

- Updated dependencies [[`5acf551`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5acf551ee0891948440798a74662e40d9917b985)]:
  - @repo/seed@0.3.0
  - @repo/seed-http@0.3.0

## 0.0.4

### Patch Changes

- Updated dependencies [[`be6d973`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/be6d9734df22b68d863bbb746250a5942983f39a), [`be6d973`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/be6d9734df22b68d863bbb746250a5942983f39a)]:
  - @repo/seed@0.2.0
  - @repo/seed-http@0.2.0

## 0.0.3

### Patch Changes

- Updated dependencies [[`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581), [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581)]:
  - @repo/seed@0.1.0
  - @repo/seed-http@0.1.0

## 0.0.2

### Patch Changes

- Updated dependencies [[`8e106b1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8e106b1f65d0fae50bb98a1a9dffdf4771f8b92d)]:
  - @repo/seed-http@0.0.2

## 0.0.1

### Patch Changes

- Updated dependencies [[`745e7a3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/745e7a3264eb65cf94dce6547573cacca9e1187a)]:
  - @repo/seed-http@0.0.1
