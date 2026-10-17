import type { RedundantLinksAdvisory } from '@repo/types';
import { describe, expect, it, vi } from 'vitest';

import { computeHealthReport } from './compute-health';
import { activity, computeInput, dependency } from './health-fixtures';
import { OFFENDER_CAP } from './thresholds';

/**
 * **The redundant-links advisory row** (redundant-link-advisory M2-T2/T3, ADR-0196): what the pure
 * model puts on the wire. The rule itself is proven in `redundant-links.spec.ts` and against the
 * engine in `redundant-links.soundness.spec.ts`; these cases pin the row's shape, its figures and its
 * sentences, so a reader of the panel is told the same thing the rule found.
 */
const named = (id: string, extra: Parameters<typeof activity>[0] = {}) =>
  activity({ id, code: id, name: `Activity ${id}`, ...extra });

const row = (report: ReturnType<typeof computeHealthReport>): RedundantLinksAdvisory => {
  const found = report.advisories.find((a) => a.id === 'REDUNDANT_LINKS');
  if (found === undefined || found.id !== 'REDUNDANT_LINKS') throw new Error('no row');
  return found;
};

const triangle = (direct: Partial<Parameters<typeof dependency>[0]>) =>
  computeInput({
    activities: [named('A'), named('B'), named('C')],
    dependencies: [
      dependency({ id: 'AB', predecessorId: 'A', successorId: 'B' }),
      dependency({ id: 'BC', predecessorId: 'B', successorId: 'C' }),
      dependency({ id: 'AC', predecessorId: 'A', successorId: 'C', ...direct }),
    ],
  });

describe('the redundant-links row', () => {
  it('is the second advisory, in tuple order, and the first stays where it was', () => {
    const report = computeHealthReport(triangle({}));
    expect(report.advisories.map((a) => a.id)).toEqual(['ZERO_DURATION_TASKS', 'REDUNDANT_LINKS']);
  });

  it('counts a redundant link against the plan’s relationships, and names it by its endpoints', () => {
    const r = row(computeHealthReport(triangle({})));
    expect(r.measured).toEqual({ count: 1, denominator: 3, percent: 33.3, ratio: null });
    expect(r.offenderCount).toBe(1);
    expect(r.offenders).toEqual([
      {
        kind: 'RELATIONSHIP',
        id: 'AC',
        code: null,
        name: 'A → C',
        // The jump seam selects the successor, as it does for the metrics' relationship rows.
        note: 'FS; already implied through B',
        activityId: 'C',
      },
    ]);
    expect(r.detail).toEqual({
      rule: 'DOMINATED_UNDER_ANY_DURATION',
      unjudged: 0,
      searchCapped: false,
    });
  });

  it('states a lag in metric 3’s phrase and a lead as a lead', () => {
    expect(row(computeHealthReport(triangle({ lagMinutes: 0 }))).offenders[0]!.note).toBe(
      'FS; already implied through B',
    );
    const lagged = computeHealthReport(
      computeInput({
        activities: [named('A'), named('B'), named('C')],
        dependencies: [
          dependency({ id: 'AB', predecessorId: 'A', successorId: 'B', lagMinutes: 60 }),
          dependency({ id: 'BC', predecessorId: 'B', successorId: 'C' }),
          dependency({ id: 'AC', predecessorId: 'A', successorId: 'C', lagMinutes: 60 }),
        ],
      }),
    );
    expect(row(lagged).offenders[0]!.note).toBe('FS, lag of 60 min; already implied through B');
    expect(row(computeHealthReport(triangle({ lagMinutes: -60 }))).offenders[0]!.note).toBe(
      'FS, lead of 60 min; already implied through B',
    );
  });

  it('names a parallel link between the same two activities', () => {
    const r = row(
      computeHealthReport(
        computeInput({
          activities: [named('A'), named('B')],
          dependencies: [
            dependency({ id: 'ss', predecessorId: 'A', successorId: 'B', type: 'SS' }),
            dependency({ id: 'fs', predecessorId: 'A', successorId: 'B', type: 'FS' }),
          ],
        }),
      ),
    );
    expect(r.offenders.map((o) => [o.id, o.note])).toEqual([
      ['ss', 'SS; already implied by the FS link between the same two activities'],
    ]);
  });

  it('abbreviates a long chain: two names, then how many more', () => {
    const ids = ['A', 'M1', 'M2', 'M3', 'M4', 'M5', 'C'];
    const r = row(
      computeHealthReport(
        computeInput({
          activities: ids.map((id) => named(id)),
          dependencies: [
            ...ids
              .slice(0, -1)
              .map((id, i) =>
                dependency({ id: `s${String(i)}`, predecessorId: id, successorId: ids[i + 1]! }),
              ),
            dependency({ id: 'AC', predecessorId: 'A', successorId: 'C' }),
          ],
        }),
      ),
    );
    expect(r.offenders.find((o) => o.id === 'AC')!.note).toBe(
      'FS; already implied through M1, M2 and 3 more',
    );
  });

  it('counts what it did not check, apart from what it found', () => {
    const r = row(
      computeHealthReport(
        computeInput({
          activities: [
            named('A'),
            named('B'),
            named('C', { constraintType: 'MSO', constraintDate: '2026-03-09' }),
          ],
          dependencies: [
            dependency({ id: 'AB', predecessorId: 'A', successorId: 'B' }),
            dependency({ id: 'BC', predecessorId: 'B', successorId: 'C' }),
            dependency({ id: 'AC', predecessorId: 'A', successorId: 'C' }),
          ],
        }),
      ),
    );
    expect(r.offenderCount).toBe(0);
    expect(r.detail.unjudged).toBe(2);
  });

  it('is "0 of 0" on an empty plan and on one with no links, never a reason', () => {
    for (const input of [
      computeInput({ activities: [] }),
      computeInput({ activities: [named('A')] }),
    ]) {
      const r = row(computeHealthReport(input));
      expect(r.measured).toEqual({ count: 0, denominator: 0, percent: 0, ratio: null });
      expect(r.offenders).toEqual([]);
      expect(r.detail.unjudged).toBe(0);
    }
  });

  it('caps the offender list at the report cap and keeps the true total', () => {
    const targets = Array.from({ length: OFFENDER_CAP + 2 }, (_, i) => `X${String(i)}`);
    const r = row(
      computeHealthReport(
        computeInput({
          activities: [named('A'), named('M'), ...targets.map((id) => named(id))],
          dependencies: [
            dependency({ id: 'AM', predecessorId: 'A', successorId: 'M' }),
            ...targets.flatMap((id) => [
              dependency({ id: `M${id}`, predecessorId: 'M', successorId: id }),
              dependency({ id: `A${id}`, predecessorId: 'A', successorId: id }),
            ]),
          ],
        }),
      ),
    );
    expect(r.offenders).toHaveLength(OFFENDER_CAP);
    expect(r.offenderCount).toBe(OFFENDER_CAP + 2);
    expect(r.offendersTruncated).toBe(true);
  });

  it('says when the work limit was reached, and reports it to the caller', () => {
    const seen = vi.fn();
    const r = row(
      computeHealthReport({ ...triangle({}), redundantLinksLimit: 1, onRedundantLinks: seen }),
    );
    expect(r.detail.searchCapped).toBe(true);
    expect(r.offenderCount).toBe(0);
    expect(r.detail.unjudged).toBe(3);
    expect(seen).toHaveBeenCalledOnce();
    expect(seen.mock.calls[0]![0]).toMatchObject({ searchCapped: true, cyclic: false });
  });

  it('does not touch the fourteen metrics or the summary (FC-4)', () => {
    // The same plan with the redundant link taken out changes metric 3's denominator and metric 4's mix,
    // as it should; what must NOT change is that the advisory never reaches the metrics or the summary
    // themselves. So the metrics are compared against a report whose rule found nothing at all.
    const withRule = computeHealthReport(triangle({}));
    const blind = computeHealthReport({ ...triangle({}), redundantLinksLimit: 0 });
    expect(row(blind).offenderCount).toBe(0);
    expect(row(withRule).offenderCount).toBe(1);
    expect(withRule.metrics).toEqual(blind.metrics);
    expect(withRule.summary).toEqual(blind.summary);
    expect(withRule.relationshipCount).toBe(blind.relationshipCount);
  });
});
