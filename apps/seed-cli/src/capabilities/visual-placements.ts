import type { SeedSpec } from '@repo/seed';

import { activity, calendar, capabilityPlan, DAY, link } from './builders.js';

/**
 * A plain Monday–Friday week, given explicitly. A plan with no `defaultCalendarKey` is PATCHed with
 * `calendarId: null` (`packages/seed-http/src/runner.ts`), and `null` resolves to the ALL-MINUTES
 * calendar (`plan-calendar.ts` — "the null path is byte-identical to M6"), not to a working week: a
 * plan left to that default schedules through weekends with no gap at all. Every date in this file
 * depends on a Saturday and Sunday being non-working, so it is stated rather than assumed.
 */
const PLACEMENT_CAL = calendar('VP_CAL', 'Visual placement five-day week', [1, 2, 3, 4, 5]);

/**
 * **Visual placement** (ADR-0033; the one-planning-surface epic, M-B-T3).
 *
 * Every constraints plan already in this tier is about the EARLY basis. Nothing in the catalogue
 * reached `visualStart` before this file: the field has existed on `SeedSpec` since it was added
 * ("the advisory hand-placement read in VISUAL mode") and every builder set it to `null`
 * (`pairwise/cases.ts`). So FC-1's own prediction — that the deployed estate holds zero placements —
 * would also have been true of the ADR-0066 catalogue itself, which would make several of the epic's
 * own falsification conditions (FC-7, FC-8) vacuous: a green result over an estate that never once
 * exercised the thing being tested. `packages/seed-http`'s runner did not even forward the field to
 * the API until this task, so a plan built against the old runner would have created every activity
 * correctly and silently left every one of them unplaced.
 *
 * `PL_MATCH`, `PL_DRIFT` and `PL_EARLIER` are three of the four placement varieties the epic's own
 * risk table names: coinciding with logic (the safe over-count FC-1 warns about — it is counted as
 * placed and will never move), differing later (the ordinary "drift visible" case a tail is drawn
 * for), and differing earlier (negative drift — `compute.ts` does not clamp a placement to be no
 * earlier than logic allows, so the engine schedules the bar exactly where it was dropped and flags
 * the conflict rather than moving it; US-1's stay-and-flag).
 *
 * `PL_SLACK` is the fourth, and it demonstrates a distinct idea from "negative total float"
 * (`plan:capability-float`, a constraint fighting the logic with no placement involved at all):
 * `remainingFloatMinutes` (M-D) will read as the room a placement leaves once its drift is subtracted
 * from an activity's own total float, so a placement that outruns that float goes negative even
 * where total float itself stays positive — a state total float alone can never show. Nothing in the
 * product reports that number yet, so the parallel path that gives `PL_SLACK` real float today is
 * seeded now, ahead of the feature, so the day `remainingFloatMinutes` ships this state is already
 * sitting in the catalogue rather than needing a second pass to invent it.
 */
export function visualPlacementsPlan(): SeedSpec {
  return capabilityPlan({
    seedName: 'capability-placements',
    name: 'Visual placement: coinciding, drifting, and outrunning a float',
    description:
      'PL_MATCH is placed exactly where logic already puts it — placed, and it will never move. ' +
      'PL_DRIFT is placed a week later, the ordinary case a drift tail is drawn for. PL_EARLIER is ' +
      'placed before its own predecessor even finishes: the engine does not clamp it, so it stays ' +
      'there and is flagged instead. PL_SLACK is placed five weeks past a float of about a ' +
      'fortnight — an ordinary positive totalFloat today; once remaining float exists, this is ' +
      'where it goes negative.',
    defaultCalendarKey: PLACEMENT_CAL.key,
    calendars: [PLACEMENT_CAL],
    activities: [
      activity('PL0', { name: 'Common predecessor' }),
      activity('PL_MATCH', {
        name: 'Placed exactly at its own logic-earliest start',
        visualStart: '2026-03-09',
      }),
      activity('PL_DRIFT', {
        name: 'Placed a week later than logic',
        visualStart: '2026-03-16',
      }),
      // FS successor of PL0 (logic-earliest start 2026-03-09), placed on 2026-03-03 — inside PL0's
      // OWN five-day span (2026-03-02 to 2026-03-06). Negative drift: the placement is earlier than
      // logic allows at all, not merely earlier than its own logic-earliest start.
      activity('PL_EARLIER', {
        name: 'Placed before its predecessor even finishes',
        visualStart: '2026-03-03',
      }),
      // The float side. PL_SLACK is short and merges with a long parallel path, so it inherits real
      // total float from the gap between the two branches (about thirteen working days: PL_LONGPATH
      // finishes 2026-03-27, PL_SLACK finishes 2026-03-10) — then is placed five weeks past its own
      // logic-earliest start, well beyond that float.
      activity('PL_SLACK', {
        name: 'Slack branch, placed past its own float',
        durationMinutes: 2 * DAY,
        visualStart: '2026-04-13',
      }),
      activity('PL_LONGPATH', {
        name: 'Long branch giving PL_SLACK its float',
        durationMinutes: 15 * DAY,
      }),
      activity('PL_MERGE', { name: 'Merge point' }),
    ],
    dependencies: [
      link('PL0', 'PL_MATCH'),
      link('PL0', 'PL_DRIFT'),
      link('PL0', 'PL_EARLIER'),
      link('PL0', 'PL_SLACK'),
      link('PL0', 'PL_LONGPATH'),
      link('PL_SLACK', 'PL_MERGE'),
      link('PL_LONGPATH', 'PL_MERGE'),
    ],
  });
}

/**
 * **A placement left behind on a plan whose stored mode is `EARLY`** (the `placement-on-early-plan`
 * diagnostic, ADR-0140's D-D2 reading). `visual_start` was always accepted regardless of the plan's
 * mode (`activities.service.ts:388`, `:526-528` — no mode check at either site), so this plan's end
 * state was indistinguishable in the database from a planner placing a bar in VISUAL and switching
 * back. Nothing records the history, and the diagnostic does not try to: it reads the current row.
 *
 * **This plan is the epic's before/after exhibit, and the collapse flips what it proves.** Before
 * M-F its placement was INERT — the surface rendered `PE_PLACED`'s `early_start` (9 Mar) and
 * ignored the placement (16 Mar). After M-F the bar is drawn where it is PLACED, so it renders
 * 16 Mar. **That is the population D-D2 was built to size, and it has now moved**; the plan is kept
 * rather than deleted because it is the only seeded case that exhibits the change, and because the
 * diagnostic remains live for the legacy rows the deployed estate still holds.
 *
 * The `schedulingMode: 'EARLY'` option is gone with the field (M-F-T4) rather than because the
 * intent changed: `scheduling_mode` still defaults to `EARLY` in the database, so what this plan
 * writes is unchanged — only the way it is asked for is.
 */
export function placementOnEarlyPlan(): SeedSpec {
  return capabilityPlan({
    seedName: 'capability-placement-on-early',
    name: 'A placement left behind on an Early plan',
    defaultCalendarKey: PLACEMENT_CAL.key,
    calendars: [PLACEMENT_CAL],
    description:
      'PE_PLACED carries a visual_start of 16 Mar on a plan whose stored scheduling_mode is ' +
      'EARLY — a placement written once and left behind. Before the one-planning-surface collapse ' +
      'the surface read its early_start (9 Mar) and ignored the placement entirely; since the ' +
      'collapse a bar is drawn where it is placed, so it renders 16 Mar. This is the population ' +
      'the placement-on-early-plan diagnostic was built to size, exhibited.',
    activities: [
      activity('PE0', { name: 'Predecessor' }),
      activity('PE_PLACED', {
        name: 'Carries a leftover placement on an Early plan',
        visualStart: '2026-03-16',
      }),
      activity('PE_FINISH', { name: 'Downstream' }),
    ],
    dependencies: [link('PE0', 'PE_PLACED'), link('PE_PLACED', 'PE_FINISH')],
  });
}
