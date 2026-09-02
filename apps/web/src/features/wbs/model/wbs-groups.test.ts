import type { ActivitySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { deriveWbsGroups, groupHasBar, wbsBandGroups } from './wbs-groups';

/**
 * `deriveWbsGroups` is the single definition of "what is filed where" for both the Gantt row model
 * and (M4) the canvas band, so these tests are the contract those two surfaces share.
 */

const activity = (over: Partial<ActivitySummary> & { id: string }): ActivitySummary =>
  ({
    name: over.id,
    type: 'TASK',
    parentId: null,
    earlyStart: null,
    earlyFinish: null,
    lateStart: null,
    lateFinish: null,
    visualEffectiveStart: null,
    visualEffectiveFinish: null,
    ...over,
  }) as ActivitySummary;

const summary = (
  id: string,
  name = id,
  parentId: string | null = null,
  over: Partial<ActivitySummary> = {},
) => activity({ id, name, parentId, type: 'WBS_SUMMARY', ...over });

describe('deriveWbsGroups', () => {
  it('buckets every top-level activity when the plan has no summaries at all', () => {
    const groups = deriveWbsGroups([activity({ id: 'a' }), activity({ id: 'b' })]);
    expect(groups.summaries).toEqual([]);
    expect(groups.unassigned?.memberIds).toEqual(['a', 'b']);
  });

  it('returns null — not an empty bucket — when everything is filed', () => {
    const groups = deriveWbsGroups([summary('s'), activity({ id: 'a', parentId: 's' })]);
    expect(groups.unassigned).toBeNull();
    expect(groups.summaries).toHaveLength(1);
    expect(groups.summaries[0]?.memberIds).toEqual(['a']);
  });

  it('splits a half-structured plan: filed work under its summary, the rest in the bucket', () => {
    const groups = deriveWbsGroups([
      summary('s'),
      activity({ id: 'filed', parentId: 's' }),
      activity({ id: 'loose' }),
    ]);
    expect(groups.summaries[0]?.memberIds).toEqual(['filed']);
    expect(groups.unassigned?.memberIds).toEqual(['loose']);
  });

  // The bucket is for unfiled WORK. A top-level summary is a group of its own, and putting it in
  // the bucket would make it appear twice — once as a group, once as a member of another.
  it('never puts a top-level summary in the bucket', () => {
    const groups = deriveWbsGroups([summary('s1'), summary('s2')]);
    expect(groups.unassigned).toBeNull();
    expect(groups.summaries.map((g) => g.summary.id)).toEqual(['s1', 's2']);
  });

  it('counts DIRECT children only — a grandchild belongs to its own parent', () => {
    const groups = deriveWbsGroups([
      summary('outer'),
      summary('inner', 'inner', 'outer'),
      activity({ id: 'leaf', parentId: 'inner' }),
    ]);
    const byId = new Map(groups.summaries.map((g) => [g.summary.id, g.memberIds]));
    expect(byId.get('outer')).toEqual(['inner']);
    expect(byId.get('inner')).toEqual(['leaf']);
  });

  /**
   * Consistency with `gantt/layout/row-model.ts`, which promotes an orphan to the root rather than
   * dropping it. If the two disagreed, an activity would be indented at the root by one and
   * considered filed by the other — a row that renders twice, or not at all.
   */
  it('treats an activity whose parent is absent as top-level, like the row model does', () => {
    const groups = deriveWbsGroups([activity({ id: 'orphan', parentId: 'gone' })]);
    expect(groups.unassigned?.memberIds).toEqual(['orphan']);
  });

  describe('the bucket’s span', () => {
    it('is the min start and max finish over its members', () => {
      const groups = deriveWbsGroups([
        activity({ id: 'a', earlyStart: '2026-03-02', earlyFinish: '2026-03-06' }),
        activity({ id: 'b', earlyStart: '2026-02-16', earlyFinish: '2026-03-20' }),
        activity({ id: 'c', earlyStart: '2026-03-09', earlyFinish: '2026-03-13' }),
      ]);
      expect(groups.unassigned?.start).toBe('2026-02-16');
      expect(groups.unassigned?.finish).toBe('2026-03-20');
    });

    it('has no bar when no member has been calculated', () => {
      const groups = deriveWbsGroups([activity({ id: 'a' }), activity({ id: 'b' })]);
      expect(groups.unassigned?.start).toBeNull();
      expect(groups.unassigned?.finish).toBeNull();
      expect(groupHasBar(groups.unassigned!)).toBe(false);
    });

    it('ignores uncalculated members rather than collapsing the span to null', () => {
      const groups = deriveWbsGroups([
        activity({ id: 'a', earlyStart: '2026-03-02', earlyFinish: '2026-03-06' }),
        activity({ id: 'b' }),
      ]);
      expect(groups.unassigned?.start).toBe('2026-03-02');
      expect(groupHasBar(groups.unassigned!)).toBe(true);
    });

    it('follows the caller’s bar-date source (ADR-0033), like every other bar', () => {
      const rows = [
        activity({
          id: 'a',
          earlyStart: '2026-03-02',
          earlyFinish: '2026-03-06',
          lateStart: '2026-04-06',
          lateFinish: '2026-04-10',
          visualEffectiveStart: '2026-03-16',
          visualEffectiveFinish: '2026-03-20',
        }),
      ];
      expect(deriveWbsGroups(rows, { source: 'early' }).unassigned?.start).toBe('2026-03-02');
      expect(deriveWbsGroups(rows, { source: 'visual' }).unassigned?.start).toBe('2026-03-16');
      expect(deriveWbsGroups(rows, { source: 'late' }).unassigned?.start).toBe('2026-04-06');
    });
  });

  /**
   * The module's central promise. A real summary's dates are the engine's — this module reads them
   * and never recomputes them, because a second rollup implementation drifting from the engine's is
   * the exact failure it exists to prevent. Here the summary's persisted span deliberately
   * disagrees with its children's; the disagreement must survive.
   */
  it('passes a real summary’s engine-computed dates through untouched', () => {
    const engineDates = { earlyStart: '2026-01-05', earlyFinish: '2026-06-30' };
    const groups = deriveWbsGroups([
      summary('s', 's', null, engineDates),
      activity({ id: 'a', parentId: 's', earlyStart: '2026-02-02', earlyFinish: '2026-02-06' }),
    ]);
    expect(groups.summaries[0]?.summary.earlyStart).toBe(engineDates.earlyStart);
    expect(groups.summaries[0]?.summary.earlyFinish).toBe(engineDates.earlyFinish);
  });

  /**
   * The documented divergence, pinned so it is a decision rather than an accident: the derived
   * bucket's span is a plain min/max and is NOT rolled onto a calendar's working boundaries the
   * way the engine rolls a real summary. A Saturday start stays a Saturday here.
   */
  it('does not roll the derived span onto working boundaries (documented divergence)', () => {
    // 2026-03-07 is a Saturday; a calendar roll would move it to the following Monday.
    const groups = deriveWbsGroups([
      activity({ id: 'a', earlyStart: '2026-03-07', earlyFinish: '2026-03-08' }),
    ]);
    expect(groups.unassigned?.start).toBe('2026-03-07');
    expect(groups.unassigned?.finish).toBe('2026-03-08');
  });
});

/**
 * The bridge from activities to TSLD band rows (ADR-0063). It is deliberately here rather than in
 * `features/tsld/render/wbs-band.ts`, because the tsld feature imports no other feature (ADR-0026
 * D8) — the host composes the two, and the shapes match structurally.
 */
describe('wbsBandGroups', () => {
  it('emits a row per summary plus the bucket, outermost first and the bucket last', () => {
    const rows = wbsBandGroups([
      summary('outer', 'Superstructure'),
      summary('inner', 'Frame', 'outer'),
      activity({ id: 'loose' }),
    ]);
    expect(rows.map((r) => r.label)).toEqual(['Superstructure', 'Frame', 'Unassigned']);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 0]);
  });

  it('gives the bucket a null id, so it can never be selected as an activity', () => {
    const rows = wbsBandGroups([summary('s'), activity({ id: 'loose' })]);
    expect(rows.at(-1)).toMatchObject({ id: null, label: 'Unassigned' });
  });

  it('omits the bucket when nothing is unfiled', () => {
    const rows = wbsBandGroups([summary('s'), activity({ id: 'a', parentId: 's' })]);
    expect(rows.map((r) => r.id)).toEqual(['s']);
  });

  /**
   * The count a band row's accessible name states (`docs/TECH_DEBT.md` #232). **A summary's count
   * is its whole subtree**, which is a decision rather than an implementation detail — see the
   * field's docblock. These cases exist so the obvious "fix" to direct children fails loudly.
   */
  describe('count', () => {
    it('counts a summary’s WHOLE subtree, not its direct children', () => {
      const rows = wbsBandGroups([
        summary('outer', 'Superstructure'),
        summary('inner', 'Frame', 'outer'),
        activity({ id: 'a', parentId: 'inner' }),
        activity({ id: 'b', parentId: 'inner' }),
      ]);
      // 3 = the nested summary + its two members. Direct children would say 1.
      expect(rows.find((r) => r.id === 'outer')?.count).toBe(3);
      expect(rows.find((r) => r.id === 'inner')?.count).toBe(2);
    });

    it('gives an empty summary zero rather than omitting it', () => {
      const rows = wbsBandGroups([summary('s', 'Fit-out')]);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.count).toBe(0);
    });

    it('counts the bucket’s members, which for the bucket is also its subtree', () => {
      const rows = wbsBandGroups([activity({ id: 'a' }), activity({ id: 'b' })]);
      expect(rows.at(-1)).toMatchObject({ id: null, count: 2 });
    });

    /**
     * An orphan — a `parentId` naming a row that is not present — counts as top-level everywhere
     * else in this module, so it must not be counted into a phantom parent's subtree either.
     */
    it('does not count an orphan into a summary that is not there', () => {
      const rows = wbsBandGroups([summary('s'), activity({ id: 'lost', parentId: 'gone' })]);
      expect(rows.find((r) => r.id === 's')?.count).toBe(0);
      expect(rows.at(-1)).toMatchObject({ id: null, count: 1 });
    });

    /**
     * Render-path code must not hang the canvas on data the server forbids (ADR-0038). A cycle in
     * the parent tree stops the walk rather than looping — the `depthOf` guard's mirror.
     */
    it('terminates on a cycle instead of hanging', () => {
      const rows = wbsBandGroups([summary('x', 'X', 'y'), summary('y', 'Y', 'x')]);
      expect(rows.every((r) => Number.isFinite(r.count))).toBe(true);
    });
  });

  it('carries a summary’s engine dates through as its span', () => {
    const rows = wbsBandGroups([
      summary('s', 'Substructure', null, { earlyStart: '2026-01-05', earlyFinish: '2026-06-30' }),
    ]);
    expect(rows[0]).toMatchObject({ start: '2026-01-05', finish: '2026-06-30' });
  });

  it('follows the bar-date source, like the bucket does', () => {
    const rows = wbsBandGroups(
      [summary('s', 'S', null, { lateStart: '2026-04-06', lateFinish: '2026-04-10' })],
      { source: 'late' },
    );
    expect(rows[0]).toMatchObject({ start: '2026-04-06', finish: '2026-04-10' });
  });

  it('treats a summary whose parent is missing as top-level', () => {
    const rows = wbsBandGroups([summary('orphan', 'Orphan', 'gone')]);
    expect(rows[0]?.depth).toBe(0);
  });

  // Render-path code: the server forbids a cycle in the parent tree, but this must not hang the
  // canvas if one ever exists.
  it('terminates on a malformed cycle', () => {
    const rows = wbsBandGroups([summary('a', 'A', 'b'), summary('b', 'B', 'a')]);
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(Number.isFinite(row.depth)).toBe(true);
  });
});
