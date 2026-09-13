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
    | 'resolveSchedulingDayFactorMinutes';
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
    symbol: 'resolveDayFactorMinutes',
    rule: 'own',
    quantity: 'the plan factor for CPLI working-day arithmetic',
    reason:
      'Plan-level: passed activityCalendarId null, so there is no activity whose driver could ' +
      'apply (the variance.ts shape, ADR-0025).',
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

const SYMBOLS = [
  'ownCalendarId',
  'schedulingCalendarId',
  'resolveDayFactorMinutes',
  'resolveSchedulingDayFactorMinutes',
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
    // The definitions themselves, and tests, are not call sites.
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
    expect(callSites().length).toBeGreaterThanOrEqual(5);
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
