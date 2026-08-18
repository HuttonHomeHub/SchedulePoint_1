import type { ActivitySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { indentTarget, isRefusal, outdentTarget } from './structure-edit';

import { anActivity } from '@/test/activity-fixture';

/**
 * **Where a row goes when a planner indents or outdents it.**
 *
 * The cases that earn their place are the refusals. Indent borrowed from P6 would make the row
 * above a summary; ADR-0038 forbids that, and — the part that matters — a summary may never be a
 * dependency endpoint, so the borrowed gesture's real effect would be **stripping the logic off
 * somebody's activity**. Refusing with a sentence is the smaller, honest capability.
 */

const act = (over: Partial<ActivitySummary>): ActivitySummary => anActivity(over);

/** Phase (summary) · Dig · Pour — Dig and Pour at the top level, after the summary. */
const flat = (): ActivitySummary[] => [
  act({ id: 'phase', name: 'Phase', type: 'WBS_SUMMARY', parentId: null }),
  act({ id: 'dig', name: 'Dig', parentId: null }),
  act({ id: 'pour', name: 'Pour', parentId: null }),
];

describe('indent', () => {
  it('files a row under the summary above it', () => {
    const outcome = indentTarget(flat(), 'dig');
    expect(outcome).toEqual({ parentId: 'phase' });
  });

  it('refuses when the row above is an activity, and says why', () => {
    // `pour` follows `dig`, which is not a summary. P6 would convert `dig`; we will not, because a
    // summary carries no logic and the conversion would silently drop every link `dig` has.
    const outcome = indentTarget(flat(), 'pour');
    expect(isRefusal(outcome)).toBe(true);
    expect(isRefusal(outcome) && outcome.reason).toMatch(/only a summary can contain/i);
  });

  it('refuses the first row, which has nothing above it', () => {
    const outcome = indentTarget(flat(), 'phase');
    expect(isRefusal(outcome) && outcome.reason).toMatch(/no summary above/i);
  });

  it('skips rows nested deeper — they are a section we are not in', () => {
    // Phase A, its child, then Dig at the top level. The child is not "the row above" for Dig; the
    // summary is. Filing under the child would jump two levels for one keypress.
    const rows = [
      act({ id: 'a', type: 'WBS_SUMMARY', parentId: null }),
      act({ id: 'a-child', parentId: 'a' }),
      act({ id: 'dig', parentId: null }),
    ];
    expect(indentTarget(rows, 'dig')).toEqual({ parentId: 'a' });
  });

  it('lets a summary be filed under another summary', () => {
    // ADR-0038's tree is arbitrary-depth, so nesting a phase inside a phase is legal and useful.
    const rows = [
      act({ id: 'outer', type: 'WBS_SUMMARY', parentId: null }),
      act({ id: 'inner', type: 'WBS_SUMMARY', parentId: null }),
    ];
    expect(indentTarget(rows, 'inner')).toEqual({ parentId: 'outer' });
  });

  it('answers for a row that is not in the view at all', () => {
    expect(isRefusal(indentTarget(flat(), 'nope'))).toBe(true);
  });
});

describe('outdent', () => {
  it('moves a child to the top level', () => {
    const rows = [
      act({ id: 'phase', type: 'WBS_SUMMARY', parentId: null }),
      act({ id: 'dig', parentId: 'phase' }),
    ];
    expect(outdentTarget(rows, 'dig')).toEqual({ parentId: null });
  });

  it('moves a grandchild up one level, not all the way out', () => {
    const rows = [
      act({ id: 'outer', type: 'WBS_SUMMARY', parentId: null }),
      act({ id: 'inner', type: 'WBS_SUMMARY', parentId: 'outer' }),
      act({ id: 'dig', parentId: 'inner' }),
    ];
    expect(outdentTarget(rows, 'dig')).toEqual({ parentId: 'outer' });
  });

  it('refuses at the top level rather than doing nothing quietly', () => {
    // A control that acts and says nothing is the lit-but-inert shape this register keeps finding.
    const outcome = outdentTarget(flat(), 'dig');
    expect(isRefusal(outcome) && outcome.reason).toMatch(/already at the top level/i);
  });

  it('sends a row whose parent has vanished to the top level', () => {
    // Paged out, or soft-deleted mid-session. There is still a knowable answer for the planner, and
    // guessing anything else would move the row somewhere nobody asked for.
    const rows = [act({ id: 'orphan', parentId: 'gone' })];
    expect(outdentTarget(rows, 'orphan')).toEqual({ parentId: null });
  });
});
