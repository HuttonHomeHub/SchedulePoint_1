import { describe, expect, it } from 'vitest';

import {
  deriveExternalInstants,
  type CrossPlanLocalActivity,
  type CrossPlanRemoteEndpoint,
  type IncomingCrossPlanEdge,
  type M1ExternalInstant,
  type OutgoingCrossPlanEdge,
} from './cross-plan-derivation';
import { allMinutesWorkCalendar, buildWorkingTimeCalendar } from './engine';

/**
 * **The derivation on instants, against a HAND-DERIVED prediction table** (#385 M2-T5,
 * test-engineer T1).
 *
 * Every expected value below was written from the calendar and the engine's documented bound
 * rules BEFORE the rewritten derivation first ran, and committed on its own. It is never read off
 * the new code's output: that would make this suite a second twin comparison, which spec D2 says
 * cannot see a defect in a shared function. A cell whose hand value disagrees with the run stops
 * the work (the FC-2 rule, applied here).
 *
 * **The rules the table is derived from** (engine semantics, not this module):
 * - An activity's **start** date means the first working minute of that day
 *   (`startDateInstant`); its **finish** date means the exclusive end of that day's working time
 *   (`finishDateInstant`); a `FINISH_MILESTONE`'s date means the END of its day rolled to the next
 *   working minute (ADR-0155); a zero-duration activity finishes at its start.
 * - The bound is the engine's own: FS = finish + lag, SS = start + lag, FF = (finish + lag) walked
 *   back by the successor's duration on the SUCCESSOR's calendar, SF = (start + lag) likewise;
 *   backward FS = late start − lag, SS = (late start − lag) + the predecessor's duration on the
 *   PREDECESSOR's calendar, FF = late finish − lag, SF = (late finish − lag) + duration.
 * - A lag walks working time on the edge's lag calendar; `TWENTY_FOUR_HOUR` is elapsed time.
 * - The derived winner is written `YYYY-MM-DDTHH:MM`, midnight included (`formatExternalInstant`);
 *   an M1 winner or tie keeps its own bare string (spec D6).
 *
 * **The walking convention was checked against the engine's calendar primitive, not this module**
 * (a throwaway probe of `addWorkingTime`, before the table was written): on the Standard calendar
 * `Sat 01-10 00:00 + 2880` lands `Wed 01-14 00:00`, `− 2880` lands `Thu 01-08 00:00`,
 * `− 4320` lands `Wed 01-07 00:00`; `Mon 02-09 − 2880` lands `Thu 02-05`, `+ 4320` lands
 * `Thu 02-12`; `Thu 02-12 + 4320` lands `Tue 02-17`; `− 1440` lands `Wed 02-11`; on the eight-hour
 * calendar `Tue 01-06 16:00 + 480` lands `Wed 01-07 16:00`; on Standard `Tue 16:00 − 1440` lands
 * `Mon 01-05 16:00`; elapsed `Sat 01-10 00:00 + 2880` lands `Mon 01-12 00:00`. So a walk lands on
 * the end boundary of its last minute, never rolled across a following non-working gap.
 *
 * **Calendar facts** used throughout. 2026-01-05 is a Monday; 2026-02-02 is a Monday.
 * - Standard: Monday–Friday 00:00–24:00 (the organisation stock calendar, E16). A day is 1440.
 * - Eight-hour: Monday–Friday 08:00–16:00. A day is 480.
 * - Every-minute: `allMinutesWorkCalendar`.
 */

const weekdays = (open: number, close: number) =>
  Array.from({ length: 7 }, (_, weekday) =>
    weekday < 5 ? [{ startMinute: open, endMinute: close }] : [],
  );
const STANDARD = buildWorkingTimeCalendar(weekdays(0, 1440), []);
const EIGHT_HOUR = buildWorkingTimeCalendar(weekdays(480, 960), []);
const DAY = 1440;

const DATA_DATE = '2026-01-05';

/** The remote end: a 3-day task on Standard, its plan's data date the Monday. */
const remoteTask = (over: Partial<CrossPlanRemoteEndpoint> = {}): CrossPlanRemoteEndpoint => ({
  type: 'TASK',
  durationMinutes: 3 * DAY,
  calendar: STANDARD,
  dataDate: DATA_DATE,
  ...over,
});

/**
 * An incoming edge (successor `A` here). Default: FS, lag 0 on Standard, upstream task placed
 * Wed 2026-01-07 to Fri 2026-01-09.
 */
const incoming = (over: Partial<IncomingCrossPlanEdge> = {}): IncomingCrossPlanEdge => ({
  successorActivityId: 'A',
  type: 'FS',
  lagMinutes: 0,
  lagCalendar: STANDARD,
  predecessor: remoteTask(),
  predecessorPlacedStart: '2026-01-07',
  predecessorPlacedFinish: '2026-01-09',
  ...over,
});

/**
 * An outgoing edge (predecessor `A` here). Default: FS, lag 0 on Standard, downstream task with
 * late start Mon 2026-02-09 and late finish Wed 2026-02-11.
 */
const outgoing = (over: Partial<OutgoingCrossPlanEdge> = {}): OutgoingCrossPlanEdge => ({
  predecessorActivityId: 'A',
  type: 'FS',
  lagMinutes: 0,
  lagCalendar: STANDARD,
  successor: remoteTask(),
  successorLateStart: '2026-02-09',
  successorLateFinish: '2026-02-11',
  ...over,
});

/** This plan's activity `A`: a 3-day task on Standard unless a case says otherwise. */
const local = (over: Partial<CrossPlanLocalActivity> = {}): CrossPlanLocalActivity => ({
  type: 'TASK',
  durationMinutes: 3 * DAY,
  calendar: STANDARD,
  ...over,
});

const activities = (
  entries: Record<string, CrossPlanLocalActivity> = { A: local() },
): Map<string, CrossPlanLocalActivity> => new Map(Object.entries(entries));
const m1 = (entries: Record<string, M1ExternalInstant>): Map<string, M1ExternalInstant> =>
  new Map(Object.entries(entries));
const EMPTY_M1 = new Map<string, M1ExternalInstant>();

const derive = (input: {
  incoming?: IncomingCrossPlanEdge[];
  outgoing?: OutgoingCrossPlanEdge[];
  m1?: Map<string, M1ExternalInstant>;
  activities?: Map<string, CrossPlanLocalActivity>;
}) =>
  deriveExternalInstants({
    incoming: input.incoming ?? [],
    outgoing: input.outgoing ?? [],
    m1: input.m1 ?? EMPTY_M1,
    activities: input.activities ?? activities(),
    dataDate: DATA_DATE,
  });

// ------------------------------------------------------------------------------------------------
// The prediction table. Each row: the case, its hand working, and the value it must produce.
// ------------------------------------------------------------------------------------------------

interface ForwardCell {
  name: string;
  edge: IncomingCrossPlanEdge;
  successor?: CrossPlanLocalActivity;
  expected: string;
}

const FORWARD: ForwardCell[] = [
  {
    // Fri 01-09 finishes at the end of Friday: Sat 01-10 00:00. Lag 0 ⇒ that instant. The engine
    // rolls it forward to Mon 01-12 00:00; the bound itself is not rolled (as in one plan).
    name: 'FS lag 0: the end of the upstream finish day',
    edge: incoming(),
    expected: '2026-01-10T00:00',
  },
  {
    // Sat 01-10 00:00 + 2 working days on Standard ⇒ Mon, Tue ⇒ Wed 01-14 00:00 (FC-3's shape).
    name: 'FS lag +2 working days across a weekend',
    edge: incoming({ lagMinutes: 2 * DAY }),
    expected: '2026-01-14T00:00',
  },
  {
    // Sat 01-10 00:00 − 2 working days ⇒ back through Fri, Thu ⇒ Thu 01-08 00:00.
    name: 'FS lead −2 working days walks back on the lag calendar',
    edge: incoming({ lagMinutes: -2 * DAY }),
    expected: '2026-01-08T00:00',
  },
  {
    // Start Wed 01-07 00:00 + 1 working day ⇒ Thu 01-08 00:00.
    name: 'SS lag +1: the upstream start plus the lag',
    edge: incoming({ type: 'SS', lagMinutes: DAY }),
    expected: '2026-01-08T00:00',
  },
  {
    // Finish Sat 01-10 00:00 + 0, then back 3 working days on the SUCCESSOR's Standard calendar
    // ⇒ Fri, Thu, Wed ⇒ Wed 01-07 00:00.
    name: 'FF lag 0: the finish walked back by the successor duration',
    edge: incoming({ type: 'FF' }),
    expected: '2026-01-07T00:00',
  },
  {
    // Start Wed 01-07 00:00 + 2 days ⇒ Fri 01-09 00:00, then back 3 days ⇒ Thu, Wed, Tue ⇒
    // Tue 01-06 00:00.
    name: 'SF lag +2: the start plus lag walked back by the successor duration',
    edge: incoming({ type: 'SF', lagMinutes: 2 * DAY }),
    expected: '2026-01-06T00:00',
  },
  {
    // A finish milestone dated Fri 01-09 means the end of Friday rolled to the next working
    // minute (ADR-0155): Mon 01-12 00:00. FS lag 0 ⇒ that instant.
    name: 'FS from a finish-milestone upstream: the end of its day, rolled',
    edge: incoming({
      predecessor: remoteTask({ type: 'FINISH_MILESTONE', durationMinutes: 0 }),
      predecessorPlacedStart: '2026-01-09',
      predecessorPlacedFinish: '2026-01-09',
    }),
    expected: '2026-01-12T00:00',
  },
  {
    // A start milestone dated Wed 01-07 finishes at its start: Wed 01-07 00:00.
    name: 'FS from a start-milestone upstream: its finish is its start',
    edge: incoming({
      predecessor: remoteTask({ type: 'START_MILESTONE', durationMinutes: 0 }),
      predecessorPlacedStart: '2026-01-07',
      predecessorPlacedFinish: '2026-01-07',
    }),
    expected: '2026-01-07T00:00',
  },
  {
    // Sat 01-10 00:00 + 2880 ELAPSED minutes ⇒ Mon 01-12 00:00 (US-2: Monday, not Wednesday).
    name: 'FS lag +2 days on TWENTY_FOUR_HOUR counts elapsed time',
    edge: incoming({ lagMinutes: 2 * DAY, lagCalendar: allMinutesWorkCalendar }),
    expected: '2026-01-12T00:00',
  },
  {
    // Both ends on the eight-hour calendar. Upstream finish Tue 01-06 means Tue 16:00; lag 1 day
    // = 480 working minutes on the eight-hour calendar ⇒ Wed 08:00–16:00 ⇒ Wed 01-07 16:00. The
    // engine rolls it to Thu 01-08 08:00, the start FC-4 predicts.
    name: 'FS lag +1 day on an eight-hour calendar (FC-4 shape)',
    edge: incoming({
      lagMinutes: 480,
      lagCalendar: EIGHT_HOUR,
      predecessor: remoteTask({ calendar: EIGHT_HOUR, durationMinutes: 3 * 480 }),
      predecessorPlacedStart: '2026-01-02',
      predecessorPlacedFinish: '2026-01-06',
    }),
    successor: local({ calendar: EIGHT_HOUR, durationMinutes: 3 * 480 }),
    expected: '2026-01-07T16:00',
  },
  {
    // Upstream on the eight-hour calendar finishes Tue 01-06 16:00; FF lag 0 on Standard leaves
    // it there; the SUCCESSOR's duration (1 day on Standard) walks back on STANDARD ⇒
    // Mon 01-05 16:00. Walking 1440 minutes on the upstream's eight-hour calendar would be three of
    // its days (Tue, Mon, Fri) and give Fri 01-02 08:00 instead.
    name: 'FF across calendars walks the duration on the successor calendar',
    edge: incoming({
      type: 'FF',
      predecessor: remoteTask({ calendar: EIGHT_HOUR, durationMinutes: 3 * 480 }),
      predecessorPlacedStart: '2026-01-02',
      predecessorPlacedFinish: '2026-01-06',
    }),
    successor: local({ durationMinutes: DAY }),
    expected: '2026-01-05T16:00',
  },
  {
    // Fri 01-30 finishes at Sat 01-31 00:00; + 5 working days ⇒ Mon 02-02 … Fri 02-06 ⇒
    // Sat 02-07 00:00.
    name: 'FS lag +5 across a month boundary',
    edge: incoming({
      lagMinutes: 5 * DAY,
      predecessorPlacedStart: '2026-01-28',
      predecessorPlacedFinish: '2026-01-30',
    }),
    expected: '2026-02-07T00:00',
  },
];

interface BackwardCell {
  name: string;
  edge: OutgoingCrossPlanEdge;
  expected: string;
}

const BACKWARD: BackwardCell[] = [
  {
    // Late start Mon 02-09 means Mon 00:00. Lag 0 ⇒ that instant. The engine rolls it back to the
    // last working end at or before it, Sat 02-07 00:00, so the upstream finishes Fri 02-06 —
    // never on the day the downstream must start (US-3, FC-9's shape).
    name: 'FS lag 0: the downstream late start as an instant',
    edge: outgoing(),
    expected: '2026-02-09T00:00',
  },
  {
    // Mon 02-09 00:00 − 2 working days ⇒ back through Fri, Thu ⇒ Thu 02-05 00:00.
    name: 'FS lag +2: the late start minus the lag, in working days',
    edge: outgoing({ lagMinutes: 2 * DAY }),
    expected: '2026-02-05T00:00',
  },
  {
    // Mon 02-09 00:00 − 0, then forward by the PREDECESSOR's 3 days ⇒ Mon, Tue, Wed ⇒
    // Thu 02-12 00:00.
    name: 'SS lag 0: the late start plus the predecessor duration',
    edge: outgoing({ type: 'SS' }),
    expected: '2026-02-12T00:00',
  },
  {
    // Late finish Wed 02-11 means Thu 02-12 00:00; − 1 working day ⇒ Wed 02-11 00:00.
    name: 'FF lag +1: the late finish minus the lag',
    edge: outgoing({ type: 'FF', lagMinutes: DAY }),
    expected: '2026-02-11T00:00',
  },
  {
    // Thu 02-12 00:00 − 0, then forward 3 days ⇒ Thu, Fri, Mon ⇒ Tue 02-17 00:00.
    name: 'SF lag 0: the late finish plus the predecessor duration',
    edge: outgoing({ type: 'SF' }),
    expected: '2026-02-17T00:00',
  },
  {
    // A finish-milestone downstream dated Wed 02-11: its date means the end of Wednesday rolled
    // forward ⇒ Thu 02-12 00:00. FS lag 0 ⇒ that instant.
    name: 'FS into a finish-milestone downstream reads the end of its day',
    edge: outgoing({
      successor: remoteTask({ type: 'FINISH_MILESTONE', durationMinutes: 0 }),
      successorLateStart: '2026-02-11',
      successorLateFinish: '2026-02-11',
    }),
    expected: '2026-02-12T00:00',
  },
  // ---- Added after the table above, when the mixed-calendar axis (M2-T6) found 96 red cells. ----
  // The engine's backward pass holds every late FINISH at the pre-gap end boundary
  // (`compute.ts`: `finish = rollBackwardToWorking(cal, dataDateAbs, upper)`) and a zero-duration
  // activity's late START at that same instant (`duration === 0 ? finish : …`). So a late date
  // read on the backward side means the END of that day's working time, never the next working
  // minute after it. The two are one position on the remote activity's own calendar and differ by
  // the non-working gap on any other, which is exactly when a lag or the local calendar sees it.
  {
    // A finish milestone on the eight-hour calendar dated Wed 02-11: its working day ends Wed
    // 16:00, which is where the engine holds its late finish and (zero duration) its late start.
    // FS lag 0 on Standard ⇒ Wed 16:00. The post-gap reading, Thu 08:00, is 960 Standard
    // minutes later.
    name: 'FS into an eight-hour finish milestone reads the END of its working day, not Thu 08:00',
    edge: outgoing({
      successor: remoteTask({
        type: 'FINISH_MILESTONE',
        durationMinutes: 0,
        calendar: EIGHT_HOUR,
      }),
      successorLateStart: '2026-02-11',
      successorLateFinish: '2026-02-11',
    }),
    expected: '2026-02-11T16:00',
  },
  {
    // A Standard finish milestone dated Fri 02-13: its working day ends Sat 02-14 00:00 (Standard
    // works to midnight), the pre-gap end boundary. FS lag 0 on the every-minute calendar ⇒ that
    // instant. The post-gap reading would be Mon 02-16 00:00, two elapsed days later.
    name: 'FS into a Friday finish milestone, 24-hour lag: the end of Friday, not Monday',
    edge: outgoing({
      lagCalendar: allMinutesWorkCalendar,
      successor: remoteTask({ type: 'FINISH_MILESTONE', durationMinutes: 0 }),
      successorLateStart: '2026-02-13',
      successorLateFinish: '2026-02-13',
    }),
    expected: '2026-02-14T00:00',
  },
  {
    // An eight-hour 3-day task with late finish Wed 02-11: its late finish is the end of Wed's
    // working time, Wed 16:00 (already the pre-gap boundary: `finishDateInstant` rolls back from
    // Thu 00:00). FF lag 0 on Standard ⇒ Wed 16:00. A control: a task's late finish did not move.
    name: 'FF from an eight-hour task: its late finish is already the end of its working day',
    edge: outgoing({
      type: 'FF',
      successor: remoteTask({ calendar: EIGHT_HOUR, durationMinutes: 3 * 480 }),
      successorLateStart: '2026-02-09',
      successorLateFinish: '2026-02-11',
    }),
    expected: '2026-02-11T16:00',
  },
];

describe('deriveExternalInstants — forward bound on instants (hand-derived)', () => {
  for (const cell of FORWARD) {
    it(cell.name, () => {
      const { derived, upstreamMissingCount } = derive({
        incoming: [cell.edge],
        activities: activities({ A: cell.successor ?? local() }),
      });
      expect(upstreamMissingCount).toBe(0);
      expect(derived.get('A')).toEqual({
        externalEarlyStart: cell.expected,
        externalLateFinish: null,
      });
    });
  }
});

describe('deriveExternalInstants — backward bound on instants (hand-derived)', () => {
  for (const cell of BACKWARD) {
    it(cell.name, () => {
      const { derived, upstreamMissingCount } = derive({ outgoing: [cell.edge] });
      expect(upstreamMissingCount).toBe(0);
      expect(derived.get('A')).toEqual({
        externalEarlyStart: null,
        externalLateFinish: cell.expected,
      });
    });
  }
});

describe('deriveExternalInstants — multi-upstream fold (latest forward / earliest backward)', () => {
  it('takes the LATEST of several incoming forward bounds', () => {
    // Finishes Tue 01-06, Fri 01-16, Mon 01-12 ⇒ ends Wed 01-07 00:00, Sat 01-17 00:00,
    // Tue 01-13 00:00 ⇒ latest Sat 01-17 00:00.
    const { derived } = derive({
      incoming: [
        incoming({ predecessorPlacedStart: '2026-01-02', predecessorPlacedFinish: '2026-01-06' }),
        incoming({ predecessorPlacedStart: '2026-01-14', predecessorPlacedFinish: '2026-01-16' }),
        incoming({ predecessorPlacedStart: '2026-01-08', predecessorPlacedFinish: '2026-01-12' }),
      ],
    });
    expect(derived.get('A')!.externalEarlyStart).toBe('2026-01-17T00:00');
  });

  it('takes the EARLIEST of several outgoing backward bounds', () => {
    // Late starts Fri 02-20, Thu 02-05, Thu 02-12 ⇒ earliest Thu 02-05 00:00.
    const { derived } = derive({
      outgoing: [
        outgoing({ successorLateStart: '2026-02-20' }),
        outgoing({ successorLateStart: '2026-02-05' }),
        outgoing({ successorLateStart: '2026-02-12' }),
      ],
    });
    expect(derived.get('A')!.externalLateFinish).toBe('2026-02-05T00:00');
  });

  it('folds incoming and outgoing for the same activity into one entry', () => {
    const { derived } = derive({ incoming: [incoming()], outgoing: [outgoing()] });
    expect(derived.get('A')).toEqual({
      externalEarlyStart: '2026-01-10T00:00',
      externalLateFinish: '2026-02-09T00:00',
    });
  });
});

describe('deriveExternalInstants — compose with the M1 column as INSTANTS (spec D6)', () => {
  it('forward: an M1 date later than the derived bound wins, as its own bare string', () => {
    // Derived Sat 01-10 00:00 (read Mon 01-12 00:00) against M1 Thu 01-15 00:00 ⇒ M1.
    const { derived } = derive({
      incoming: [incoming()],
      m1: m1({ A: { externalEarlyStart: '2026-01-15', externalLateFinish: null } }),
    });
    expect(derived.get('A')!.externalEarlyStart).toBe('2026-01-15');
  });

  it('forward: a derived bound later than the M1 date wins, timed', () => {
    // Derived Wed 01-14 00:00 against M1 Mon 01-12 00:00 ⇒ derived.
    const { derived } = derive({
      incoming: [incoming({ lagMinutes: 2 * DAY })],
      m1: m1({ A: { externalEarlyStart: '2026-01-12', externalLateFinish: null } }),
    });
    expect(derived.get('A')!.externalEarlyStart).toBe('2026-01-14T00:00');
  });

  it('forward: a tie keeps the M1 string, so the engine input is byte-identical', () => {
    // Derived Sat 01-10 00:00 is read as Mon 01-12 00:00, the same instant M1 Mon 01-12 names.
    const { derived } = derive({
      incoming: [incoming()],
      m1: m1({ A: { externalEarlyStart: '2026-01-12', externalLateFinish: null } }),
    });
    expect(derived.get('A')!.externalEarlyStart).toBe('2026-01-12');
  });

  /**
   * **The string-comparison trap** (spec D6). A bare finish-milestone date means the END of its day,
   * so `2026-01-12` is LATER than `2026-01-12T10:00` although it sorts earlier. The upstream here
   * is on the every-minute calendar and finishes Sun 01-11, i.e. Mon 01-12 00:00; a 600-minute
   * elapsed lag puts the bound at Mon 01-12 10:00. The local successor is a finish milestone on
   * Standard, so a bare M1 `2026-01-12` reads Tue 01-13 00:00 and wins; a bare `2026-01-11`
   * reads Mon 01-12 00:00 and loses. String comparison gets the first one wrong.
   */
  const timedUpstream = incoming({
    lagMinutes: 600,
    lagCalendar: allMinutesWorkCalendar,
    predecessor: remoteTask({ calendar: allMinutesWorkCalendar, durationMinutes: 3 * DAY }),
    predecessorPlacedStart: '2026-01-09',
    predecessorPlacedFinish: '2026-01-11',
  });
  const milestone = activities({ A: local({ type: 'FINISH_MILESTONE', durationMinutes: 0 }) });

  it('forward, finish milestone: a bare M1 date on the same day as a timed bound is LATER', () => {
    const { derived } = derive({
      incoming: [timedUpstream],
      activities: milestone,
      m1: m1({ A: { externalEarlyStart: '2026-01-12', externalLateFinish: null } }),
    });
    expect(derived.get('A')!.externalEarlyStart).toBe('2026-01-12');
  });

  it('forward, finish milestone: the timed bound wins over the bare date the day before', () => {
    const { derived } = derive({
      incoming: [timedUpstream],
      activities: milestone,
      m1: m1({ A: { externalEarlyStart: '2026-01-11', externalLateFinish: null } }),
    });
    expect(derived.get('A')!.externalEarlyStart).toBe('2026-01-12T10:00');
  });

  it('backward: an M1 date tighter than the derived bound wins, as its own bare string', () => {
    // M1 Thu 02-05 reads the end of Thursday, Fri 02-06 00:00; derived Mon 02-09 00:00 ⇒ M1.
    const { derived } = derive({
      outgoing: [outgoing()],
      m1: m1({ A: { externalEarlyStart: null, externalLateFinish: '2026-02-05' } }),
    });
    expect(derived.get('A')!.externalLateFinish).toBe('2026-02-05');
  });

  it('backward: a derived bound tighter than the M1 date wins, timed', () => {
    // M1 Tue 02-10 reads Wed 02-11 00:00; derived Mon 02-09 00:00 ⇒ derived.
    const { derived } = derive({
      outgoing: [outgoing()],
      m1: m1({ A: { externalEarlyStart: null, externalLateFinish: '2026-02-10' } }),
    });
    expect(derived.get('A')!.externalLateFinish).toBe('2026-02-09T00:00');
  });

  it('an activity with only an incoming edge still reproduces its M1 late-finish column', () => {
    const { derived } = derive({
      incoming: [incoming()],
      m1: m1({ A: { externalEarlyStart: null, externalLateFinish: '2026-03-01' } }),
    });
    expect(derived.get('A')).toEqual({
      externalEarlyStart: '2026-01-10T00:00',
      externalLateFinish: '2026-03-01',
    });
  });
});

describe('deriveExternalInstants — the LOE skip and the N32 skip are separate branches', () => {
  it('an LOE upstream contributes no bound and is NOT counted as never calculated', () => {
    const { derived, upstreamMissingCount } = derive({
      incoming: [incoming({ predecessor: remoteTask({ type: 'LEVEL_OF_EFFORT' }) })],
    });
    expect(upstreamMissingCount).toBe(0);
    expect(derived.get('A')).toEqual({ externalEarlyStart: null, externalLateFinish: null });
  });

  it('an LOE upstream with null dates is still an LOE skip, not an N32 count', () => {
    const { upstreamMissingCount } = derive({
      incoming: [
        incoming({
          predecessor: remoteTask({ type: 'LEVEL_OF_EFFORT' }),
          predecessorPlacedStart: null,
          predecessorPlacedFinish: null,
        }),
      ],
    });
    expect(upstreamMissingCount).toBe(0);
  });

  it('an LOE downstream contributes no backward bound', () => {
    const { derived, upstreamMissingCount } = derive({
      outgoing: [outgoing({ successor: remoteTask({ type: 'LEVEL_OF_EFFORT' }) })],
    });
    expect(upstreamMissingCount).toBe(0);
    expect(derived.get('A')).toEqual({ externalEarlyStart: null, externalLateFinish: null });
  });

  it('a null upstream finish (FS) contributes no bound and IS counted (N32)', () => {
    const { derived, upstreamMissingCount } = derive({
      incoming: [incoming({ predecessorPlacedStart: null, predecessorPlacedFinish: null })],
    });
    expect(upstreamMissingCount).toBe(1);
    expect(derived.get('A')).toEqual({ externalEarlyStart: null, externalLateFinish: null });
  });

  it('a missing upstream still lets the M1 column stand', () => {
    const { derived, upstreamMissingCount } = derive({
      incoming: [incoming({ predecessorPlacedFinish: null })],
      m1: m1({ A: { externalEarlyStart: '2026-01-15', externalLateFinish: null } }),
    });
    expect(upstreamMissingCount).toBe(1);
    expect(derived.get('A')!.externalEarlyStart).toBe('2026-01-15');
  });

  it('counts one per missing edge and still folds the present ones', () => {
    // The present FS: Fri 01-16 ⇒ Sat 01-17 00:00.
    const { derived, upstreamMissingCount } = derive({
      incoming: [
        incoming({ predecessorPlacedFinish: null }),
        incoming({ predecessorPlacedStart: '2026-01-14', predecessorPlacedFinish: '2026-01-16' }),
        incoming({ type: 'SS', predecessorPlacedStart: null }),
      ],
    });
    expect(upstreamMissingCount).toBe(2);
    expect(derived.get('A')!.externalEarlyStart).toBe('2026-01-17T00:00');
  });

  it('a missing SS forward bound reads the START date (not the finish)', () => {
    const { upstreamMissingCount } = derive({
      incoming: [incoming({ type: 'SS', predecessorPlacedStart: null })],
    });
    expect(upstreamMissingCount).toBe(1);
  });

  it('an outgoing edge to a never-computed DOWNSTREAM successor is NOT counted (§30.5)', () => {
    const { derived, upstreamMissingCount } = derive({
      outgoing: [outgoing({ successorLateStart: null, successorLateFinish: null })],
    });
    expect(upstreamMissingCount).toBe(0);
    expect(derived.get('A')).toEqual({ externalEarlyStart: null, externalLateFinish: null });
  });
});

describe('deriveExternalInstants — shape & edge cases', () => {
  it('an empty input derives nothing and counts no missing upstream', () => {
    const { derived, upstreamMissingCount } = derive({ activities: activities({}) });
    expect(derived.size).toBe(0);
    expect(upstreamMissingCount).toBe(0);
  });

  it('produces one entry per DISTINCT linked activity (keyed correctly)', () => {
    const { derived } = derive({
      incoming: [
        incoming({ successorActivityId: 'A' }),
        incoming({
          successorActivityId: 'B',
          predecessorPlacedStart: '2026-01-14',
          predecessorPlacedFinish: '2026-01-16',
        }),
      ],
      outgoing: [outgoing({ predecessorActivityId: 'C' })],
      activities: activities({ A: local(), B: local(), C: local() }),
    });
    expect([...derived.keys()].sort()).toEqual(['A', 'B', 'C']);
    expect(derived.get('A')!.externalEarlyStart).toBe('2026-01-10T00:00');
    expect(derived.get('B')!.externalEarlyStart).toBe('2026-01-17T00:00');
    expect(derived.get('C')!.externalLateFinish).toBe('2026-02-09T00:00');
  });

  it('a midnight bound is written with its time, never as a bare date (spec D7, E12)', () => {
    // Onto a finish-milestone successor a bare `2026-01-10` would be read as the END of Saturday;
    // the formatter keeps `T00:00` so it is read as the instant.
    const { derived } = derive({
      incoming: [incoming()],
      activities: activities({ A: local({ type: 'FINISH_MILESTONE', durationMinutes: 0 }) }),
    });
    expect(derived.get('A')!.externalEarlyStart).toBe('2026-01-10T00:00');
  });

  it('an activity missing from `activities` is a caller defect and throws', () => {
    expect(() => derive({ incoming: [incoming()], activities: activities({}) })).toThrow(/A/);
  });
});
