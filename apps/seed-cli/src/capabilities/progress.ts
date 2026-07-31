import type { SeedActivity, SeedSpec } from '@repo/seed';

import { activity, capabilityPlan, DAY, link } from './builders.js';

/**
 * **Progress and retained logic** (ADR-0066 M2).
 *
 * Progress is the one family where the *plan-level* switch changes the answer for every activity, so
 * it ships as a matched pair: `progressPlan()` under Retained Logic (the default) and
 * `progressOverridePlan()` under Progress Override, over the **same** out-of-sequence chain. Read
 * side by side they are the only way to see what the setting does — a single plan can show one
 * answer and give no way to tell whether the other would differ.
 */

const ACTUAL_START = '2026-02-23T00:00';

export function progressPlan(): SeedSpec {
  return capabilityPlan({
    seedName: 'capability-progress',
    name: 'Progress: statuses, suspend and resume',
    description:
      'P1 is complete and behind the 2 Mar data date. P2 is 40% done with three days left. P3 is ' +
      'suspended and never resumes, so its remaining work sits after the suspend. P4 suspends and ' +
      'resumes, splitting its bar in two. P5 says 80% but has ten days remaining — the two ' +
      'disagree on purpose, and the remaining duration is what schedules.',
    activities: [
      activity('P1', {
        name: 'Complete',
        progress: progress({
          status: 'COMPLETE',
          percentComplete: 100,
          actualStart: ACTUAL_START,
          actualFinish: '2026-02-27T00:00',
          remainingDurationMinutes: 0,
        }),
        testTags: ['prog_complete'],
      }),
      activity('P2', {
        name: 'In progress',
        progress: progress({
          percentComplete: 40,
          actualStart: ACTUAL_START,
          remainingDurationMinutes: 3 * DAY,
        }),
        testTags: ['prog_in_progress'],
      }),
      activity('P3', {
        name: 'Suspended, never resumed',
        progress: progress({
          percentComplete: 30,
          actualStart: ACTUAL_START,
          remainingDurationMinutes: 4 * DAY,
          suspendDate: '2026-02-26T00:00',
        }),
        testTags: ['prog_suspended_no_resume'],
      }),
      activity('P4', {
        name: 'Suspended and resumed',
        progress: progress({
          percentComplete: 50,
          actualStart: ACTUAL_START,
          remainingDurationMinutes: 3 * DAY,
          suspendDate: '2026-02-25T00:00',
          resumeDate: '2026-02-27T00:00',
        }),
        testTags: ['prog_suspend_resume'],
      }),
      // The resume is in the FUTURE relative to the data date. The remaining work cannot start
      // before it, which is a different clamp from the data-date floor and is easy to conflate.
      activity('P5', {
        name: 'Resumes after the data date',
        progress: progress({
          percentComplete: 20,
          actualStart: ACTUAL_START,
          remainingDurationMinutes: 6 * DAY,
          suspendDate: '2026-02-26T00:00',
          resumeDate: '2026-03-16T00:00',
        }),
        testTags: ['prog_resume_after_data_date'],
      }),
      // Percent complete and remaining duration are independent inputs (ADR-0035 §8) and here they
      // disagree loudly. The REMAINING DURATION drives the dates; the percentage is reporting.
      activity('P6', {
        name: '80% done with ten days left',
        durationMinutes: 12 * DAY,
        progress: progress({
          percentComplete: 80,
          actualStart: ACTUAL_START,
          remainingDurationMinutes: 10 * DAY,
        }),
        testTags: ['prog_rd_vs_pct_divergence'],
      }),
      // Started, nothing remaining, not marked complete. A stopped activity is not a finished one,
      // and a scheduler that infers completion from zero remaining gets this wrong.
      activity('P7', {
        name: 'Stopped with zero remaining',
        progress: progress({
          percentComplete: 60,
          actualStart: ACTUAL_START,
          remainingDurationMinutes: 0,
        }),
        testTags: ['prog_stopped_zero_remaining'],
      }),
      // Percent-complete TYPE: which measure the number means (ADR-0042). UNITS earns from the
      // resource assignment; PHYSICAL is a manual judgement that moves no date at all.
      activity('P8', {
        name: 'Units percent complete',
        progress: progress({
          percentComplete: 50,
          percentCompleteType: 'UNITS',
          actualStart: ACTUAL_START,
          remainingDurationMinutes: 2 * DAY,
        }),
        testTags: ['pct_units'],
      }),
      activity('P9', {
        name: 'Physical percent complete from weighted steps',
        progress: progress({
          percentComplete: 25,
          percentCompleteType: 'PHYSICAL',
          physicalPercentComplete: 60,
          actualStart: ACTUAL_START,
          remainingDurationMinutes: 4 * DAY,
        }),
        // Weighted steps roll up to the physical measure and silently override the manual value
        // (ADR-0044 §33) — which is exactly why both are on one activity here.
        steps: [
          { name: 'Set out', weight: 1, percentComplete: 100 },
          { name: 'Excavate', weight: 3, percentComplete: 75 },
          { name: 'Blind', weight: 1, percentComplete: 0 },
        ],
        testTags: ['pct_physical', 'code_steps'],
      }),
    ],
  });
}

/** The out-of-sequence chain, scheduled under Retained Logic — the application's default. */
export function retainedLogicPlan(): SeedSpec {
  return capabilityPlan({
    seedName: 'capability-retained-logic',
    name: 'Progress: out of sequence under Retained Logic',
    description:
      'R2 has started even though R1 is not finished — work happened out of sequence. Under ' +
      'RETAINED LOGIC (this plan) R2’s REMAINING work still waits for R1. Compare against the ' +
      'Progress Override plan, where it does not: that difference is the whole setting.',
    options: { progressRecalcMode: 'RETAINED_LOGIC' },
    activities: outOfSequenceActivities([
      'prog_out_of_sequence',
      'retained_logic_vs_progress_override',
    ]),
    dependencies: [link('R1', 'R2'), link('R2', 'R3')],
  });
}

/** The identical chain under Progress Override, so the pair is a controlled comparison. */
export function progressOverridePlan(): SeedSpec {
  return capabilityPlan({
    seedName: 'capability-progress-override',
    name: 'Progress: out of sequence under Progress Override',
    description:
      'The same three activities as the Retained Logic plan, scheduled with PROGRESS OVERRIDE: ' +
      'R2’s remaining work is freed from R1 and starts at the data date instead. If these two ' +
      'plans show the same dates, the setting is not being read.',
    options: { progressRecalcMode: 'PROGRESS_OVERRIDE' },
    activities: outOfSequenceActivities([]),
    dependencies: [link('R1', 'R2'), link('R2', 'R3')],
  });
}

/** R1 unstarted, R2 started before it — the out-of-sequence shape both modes are read against. */
function outOfSequenceActivities(tags: readonly string[]): SeedActivity[] {
  return [
    activity('R1', { name: 'Predecessor, not started' }),
    activity('R2', {
      name: 'Successor, started early',
      progress: progress({
        percentComplete: 35,
        actualStart: '2026-02-24T00:00',
        remainingDurationMinutes: 4 * DAY,
      }),
      testTags: [...tags],
    }),
    activity('R3', { name: 'Downstream' }),
  ];
}

/** Progress with the application's own defaults for everything the case does not vary. */
function progress(
  overrides: Partial<NonNullable<SeedActivity['progress']>>,
): NonNullable<SeedActivity['progress']> {
  return {
    status: 'IN_PROGRESS',
    percentComplete: 0,
    percentCompleteType: 'DURATION',
    physicalPercentComplete: null,
    actualStart: null,
    actualFinish: null,
    remainingDurationMinutes: null,
    suspendDate: null,
    resumeDate: null,
    expectedFinish: null,
    ...overrides,
  };
}
