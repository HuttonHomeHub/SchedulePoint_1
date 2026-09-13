import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

/**
 * Every day↔minute conversion names which of the two rules it wants (`docs/TECH_DEBT.md` #86).
 *
 * The defect this guards was never a wrong implementation. It was ONE implementation serving two
 * different quantities — the activity as an object, and the work it schedules — with no way for a
 * compiler or a reader to ask which a call site meant. Splitting it is only half the fix; the other
 * half is that a NEW call site cannot quietly pick whichever rule it typed first.
 *
 * **Blind spot, stated rather than implied:** this reads call sites by name, so a resolver reached
 * through an alias or a re-export is invisible to it. It also cannot see whether a classification is
 * CORRECT — only that somebody made one and wrote down why.
 */

/** The quantity a call site converts, and why that rule and not the other. */
interface CensusEntry {
  readonly file: string;
  readonly symbol:
    | 'ownCalendarId'
    | 'schedulingCalendarId'
    | 'resolveDayFactorMinutes'
    | 'resolveSchedulingDayFactorMinutes'
    | 'attachDayFactors'
    | 'attachLagDayFactors'
    | 'resolveLagDayFactorMinutes';
  readonly rule: 'own' | 'scheduling';
  readonly quantity: string;
  readonly reason: string;
}

const CENSUS: readonly CensusEntry[] = [
  {
    file: 'src/modules/activities/activities.service.ts',
    symbol: 'resolveDayFactorMinutes',
    rule: 'own',
    quantity: 'create → durationMinutes',
    reason:
      'A brand-new activity holds no assignment, so no driver can exist to defer to. Using the ' +
      'scheduling rule here would be indistinguishable in behaviour and misleading to read.',
  },
  {
    file: 'src/modules/activities/activities.service.ts',
    symbol: 'resolveSchedulingDayFactorMinutes',
    rule: 'scheduling',
    quantity: 'update → durationMinutes, and progress → remainingDurationMinutes',
    reason:
      'A duration measures the WORK, and a remainder scales with the duration it is a remainder ' +
      'of. Converting either on the activity own calendar stores a different quantity of work ' +
      'than the planner typed (#86).',
  },
  {
    file: 'src/modules/baselines/baselines.service.ts',
    symbol: 'resolveDayFactorMinutes',
    rule: 'own',
    quantity: 'baseline capture factor',
    reason:
      'Plan-level and frozen at capture (ADR-0068 §5): it is passed activityCalendarId null, so ' +
      'it resolves the plan calendar and no activity driver is in scope at all.',
  },
  {
    file: 'src/modules/dependencies/lag-day-factor.ts',
    symbol: 'schedulingCalendarId',
    rule: 'scheduling',
    quantity: 'PREDECESSOR / SUCCESSOR relationship lag',
    reason:
      'A lag measures the work at the end it names, and a driven end does that work on its ' +
      'driving resource calendar (ADR-0039 §4).',
  },
  {
    file: 'src/modules/schedule/schedule.service.ts',
    symbol: 'schedulingCalendarId',
    rule: 'scheduling',
    quantity: 'dayFactorCalIdByActivity — the map the recalculation converts float days with',
    reason:
      'The second of #86 two mechanisms. The engine port map carries null as an INHERIT sentinel ' +
      'and resolveDayFactors read that as no calendar at all, taking 1440 while the schedule ran ' +
      'on the plan day. This builds the resolved map beside it, by calling the rule rather than ' +
      'restating its fallback rung.',
  },
  {
    file: 'src/modules/schedule/schedule.service.ts',
    symbol: 'resolveDayFactorMinutes',
    rule: 'own',
    quantity: 'the plan factor for CPLI working-day arithmetic',
    reason:
      'Plan-level: passed activityCalendarId null, so there is no activity whose driver could ' +
      'apply (the variance.ts shape, ADR-0025).',
  },
  {
    file: 'src/modules/activities/activities.service.ts',
    symbol: 'attachDayFactors',
    rule: 'scheduling',
    quantity: 'every read of durationDays / remainingDurationDays / levelingDelayDays',
    reason:
      'The read half of the write above, and it must agree with it or a value round-trips to a ' +
      'different number than it was saved as. Reporting a driven duration on the activity own ' +
      'calendar is how "5 days of duration, 2 days of float" reached one planner on one row (#86).',
  },
  {
    file: 'src/modules/share/share-guest.service.ts',
    symbol: 'attachDayFactors',
    rule: 'scheduling',
    quantity: 'guest read of durationDays and siblings',
    reason:
      'CQ-4: a guest adopts the correction. A duration is a property of the work, so withholding ' +
      'it would have a guest and a member read different numbers off the same bar. The resource ' +
      'stays invisible (ADR-0051) — only the frame changes.',
  },
  {
    file: 'src/modules/schedule/schedule.service.ts',
    symbol: 'attachDayFactors',
    rule: 'scheduling',
    quantity: 'DCMA metric 8 conversion, and the metric 12 injection unit',
    reason:
      'Both convert a stored duration into days to judge or to lengthen it, so both measure the ' +
      'WORK. A health finding derived on the wrong day length would report a correct plan as ' +
      'failing metric 8, which is the one thing an assessment must not do (ADR-0116).',
  },
  {
    file: 'src/modules/dependencies/dependencies.service.ts',
    symbol: 'attachLagDayFactors',
    rule: 'scheduling',
    quantity: 'lagDays on every relationship read',
    reason:
      'The read half of the two lag writes below. A lag measures the work at the end it names ' +
      '(ADR-0070 §5), and a driven end does that work on its driving resource calendar.',
  },
  {
    file: 'src/modules/dependencies/dependencies.service.ts',
    symbol: 'resolveLagDayFactorMinutes',
    rule: 'scheduling',
    quantity: 'create and update → lagMinutes from a submitted lagDays',
    reason:
      'Two sites, create and update, sharing one resolver so they cannot disagree. Converting on ' +
      'the endpoint own calendar would store a lag the client had computed on another one, and ' +
      'the field would read back a different number from the one that was typed.',
  },
];

/**
 * The ADR-0071 §1 exception, recorded as a NON-site so it cannot be "fixed" into one.
 *
 * The per-assignment join lag is deliberately framed on the activity own calendar even for a
 * RESOURCE_DEPENDENT activity scheduled elsewhere, and the histogram path resolves it through the
 * engine rather than through these resolvers. It therefore appears in no census row, and that
 * absence is a decision.
 */
const DELIBERATE_NON_SITES = ['per-assignment join lag (ADR-0071 §1 / ADR-0035 §34)'];

/**
 * **The wrappers are in this list, and that is the M5 review's finding.**
 *
 * The first version named only the four resolvers — and almost nothing calls those directly. Seven
 * of the twelve real call sites reach the rule through `attachDayFactors`, `attachLagDayFactors` or
 * `resolveLagDayFactorMinutes`, so the census asserted "every call site is classified" over a
 * population that excluded most of them, and would have passed against a new service picking the
 * wrong wrapper. A census is only worth the names it knows: these are the names callers type.
 */
const SYMBOLS = [
  'ownCalendarId',
  'schedulingCalendarId',
  'resolveDayFactorMinutes',
  'resolveSchedulingDayFactorMinutes',
  'attachDayFactors',
  'attachLagDayFactors',
  'resolveLagDayFactorMinutes',
] as const;

function callSites(): { file: string; symbol: string }[] {
  const out = execFileSync(
    'grep',
    ['-rn', '--include=*.ts', SYMBOLS.map((s) => `${s}(`).join('\\|'), 'src'],
    { cwd: process.cwd(), encoding: 'utf8' },
  );
  const sites: { file: string; symbol: string }[] = [];
  for (const line of out.split('\n')) {
    if (line === '') continue;
    const file = line.slice(0, line.indexOf(':'));
    // The definitions themselves, and tests, are not call sites. `day-factor.ts` is skipped by
    // FILE because every symbol in it is either a definition or one definition calling another.
    // `lag-day-factor.ts` deliberately is NOT: it defines the two lag wrappers — excluded by the
    // `function X(` test below — while genuinely CALLING `schedulingCalendarId`, which is a real
    // site and is classified. Skipping it by file would hide the one rule choice it makes.
    if (file === 'src/modules/activities/day-factor.ts') continue;
    if (file.endsWith('.spec.ts')) continue;
    for (const symbol of SYMBOLS) {
      if (line.includes(`${symbol}(`) && !line.includes(`function ${symbol}(`)) {
        sites.push({ file, symbol });
      }
    }
  }
  return sites;
}

describe('day-factor rule census (#86)', () => {
  it('has no `effectiveCalendarId` left — the one-rule-for-two-quantities symbol is gone', () => {
    // `--exclude=*.spec.ts` is load-bearing and was added after this assertion failed on its first
    // run against a correct tree: the only matches were THIS FILE's own prose. That is the
    // scan-matching-its-own-documentation trap the register has now recorded four times, and the
    // fix is the same one its siblings took — measure production, not the description of it.
    expect(() =>
      execFileSync(
        'grep',
        ['-rn', '--include=*.ts', '--exclude=*.spec.ts', 'effectiveCalendarId', 'src'],
        { cwd: process.cwd(), encoding: 'utf8' },
      ),
    ).toThrow(); // grep exits 1 when it finds nothing
  });

  it('classifies every call site of either rule', () => {
    const unclassified = callSites().filter(
      (site) => !CENSUS.some((entry) => entry.file === site.file && entry.symbol === site.symbol),
    );
    expect(unclassified).toEqual([]);
  });

  it('lists no census row that is not a real call site', () => {
    const sites = callSites();
    const stale = CENSUS.filter(
      (entry) => !sites.some((s) => s.file === entry.file && s.symbol === entry.symbol),
    );
    expect(stale).toEqual([]);
  });

  /**
   * The pinned positive case. Without it, "every call site is classified" passes perfectly against
   * a census that found NO call sites — the ADR-0093 / ADR-0108 shape, where a green suite cannot
   * distinguish "all classified" from "nothing to classify".
   */
  it('finds call sites at all, and both rules are actually in use', () => {
    // The floor is 12 against a measured 14, and that number is doing a second job. At its
    // original 5 it was satisfied by the FOUR-resolver symbol list this census shipped with —
    // which found 7 sites and missed the seven that reach a rule through a wrapper. So narrowing
    // `SYMBOLS` back would have left every assertion green over a population most callers are not
    // in. Above 7, it cannot.
    expect(callSites().length).toBeGreaterThanOrEqual(12);
    expect(CENSUS.some((e) => e.rule === 'own')).toBe(true);
    expect(CENSUS.some((e) => e.rule === 'scheduling')).toBe(true);
  });

  it('gives every classification a quantity and a reason', () => {
    for (const entry of CENSUS) {
      expect(entry.quantity.length).toBeGreaterThan(0);
      expect(entry.reason.length).toBeGreaterThan(20);
    }
    expect(DELIBERATE_NON_SITES.length).toBeGreaterThan(0);
  });
});
