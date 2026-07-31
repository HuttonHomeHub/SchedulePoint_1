import type { SeedSpec } from '@repo/seed';

import { activity, capabilityPlan, DAY, link } from './builders.js';

/**
 * **Network shape, open ends and float** (ADR-0066 M2).
 *
 * These are the properties of a *graph* rather than of any one activity, which is exactly why they
 * are hard to see in a 129-activity plan and easy to see in ten. Every one of them changes what the
 * critical path is allowed to be.
 */
export function networkShapePlan(): SeedSpec {
  return capabilityPlan({
    seedName: 'capability-network-shape',
    name: 'Network: open ends, merges and dangles',
    description:
      'N1 has no predecessor and N5 no successor, so the plan has one true start and one true ' +
      'finish. N4 is a merge point with two predecessors and takes the LATER of them. N3 is ' +
      'redundant — N2 already reaches N4 directly — so removing it must change nothing. N7 hangs ' +
      'off the network entirely, and N6 takes no time at all without being a milestone.',
    activities: [
      activity('N1', { name: 'Open start', testTags: ['net_open_start'] }),
      activity('N2', { name: 'Merge feeder A', durationMinutes: 3 * DAY }),
      // Redundant: N2 → N4 exists directly, so this path can never be the binding one. It must not
      // change a single date, and a scheduler that double-counts logic is where it shows.
      activity('N3', { name: 'Redundant path', testTags: ['net_redundant_logic'] }),
      activity('N4', {
        name: 'Merge point',
        testTags: ['net_merge_point', 'net_multiple_predecessors'],
      }),
      activity('N5', {
        name: 'Project finish',
        testTags: ['net_open_finish', 'project_finish', 'float_multiple_paths_target'],
      }),
      // A zero-duration TASK is NOT a milestone (ADR-0035 §5) — it keeps task semantics and simply
      // takes no time. The distinction shipped as its own conformance case because collapsing the
      // two is the obvious wrong answer.
      activity('N6', {
        name: 'Zero-duration task',
        durationMinutes: 0,
        testTags: ['net_zero_duration_task'],
      }),
      // No edges in either direction. It still has to schedule, and it still has to appear.
      activity('N7', {
        name: 'Dangling activity',
        testTags: ['net_dangling_activity', 'net_dangling_start'],
      }),
      activity('N8', { name: 'Dangling pair, driver' }),
      activity('N9', { name: 'Dangling pair, partner', testTags: ['net_dangling_partner'] }),
    ],
    dependencies: [
      link('N1', 'N2'),
      link('N1', 'N3'),
      link('N2', 'N4'),
      link('N3', 'N4'),
      link('N4', 'N5'),
      link('N4', 'N6'),
      link('N8', 'N9'),
    ],
  });
}

/**
 * **Float, and what drives it negative.** A separate plan because negative float is caused by a
 * constraint fighting the logic, and mixing that into the shape plan above would make every date in
 * it a consequence of the constraint rather than of the shape.
 */
export function floatPlan(): SeedSpec {
  return capabilityPlan({
    seedName: 'capability-float',
    name: 'Float: zero, free and negative',
    description:
      'D3 must finish by a date the logic cannot reach, so D3 and everything driving it carry ' +
      'NEGATIVE total float — D1 is the driver and shows it first. D5 has slack: it can slip ' +
      'without moving D6, so its free float is positive while D4’s is zero.',
    activities: [
      activity('D1', { name: 'Negative-float driver', testTags: ['float_negative_driver'] }),
      activity('D2', { name: 'Negative-float chain' }),
      // FNLT one week before the chain can possibly finish. The constraint is honoured, the logic
      // is not silently broken, and the shortfall surfaces as negative float rather than as a
      // rejected edit (ADR-0035 §7 — produce and flag).
      activity('D3', {
        name: 'Constrained finish, unreachable',
        constraintType: 'FNLT',
        constraintDate: '2026-03-16',
        testTags: ['float_negative', 'pathological'],
      }),
      activity('D4', { name: 'Driving predecessor', durationMinutes: 5 * DAY }),
      // Shorter than its sibling, so it can start late without delaying D6 — the definition of free
      // float, and the only way to tell free float apart from total float in a picture.
      activity('D5', { name: 'Slack predecessor', durationMinutes: 2 * DAY }),
      activity('D6', { name: 'Merge with slack', testTags: ['float_zero_free'] }),
    ],
    dependencies: [link('D1', 'D2'), link('D2', 'D3'), link('D4', 'D6'), link('D5', 'D6')],
  });
}
