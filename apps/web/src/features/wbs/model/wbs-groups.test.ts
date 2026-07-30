import type { ActivitySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { deriveWbsGroups, groupHasBar } from './wbs-groups';

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

const summary = (id: string, over: Partial<ActivitySummary> = {}) =>
  activity({ id, type: 'WBS_SUMMARY', ...over });

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
      summary('inner', { parentId: 'outer' }),
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
      summary('s', engineDates),
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
