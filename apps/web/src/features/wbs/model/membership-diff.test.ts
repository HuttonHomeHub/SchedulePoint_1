import { describe, expect, it } from 'vitest';

import { membershipDiff } from './membership-diff';

const SUMMARY = 's1';

type Row = { id: string; parentId: string | null; version: number };

const row = (id: string, parentId: string | null = null, version = 1): Row => ({
  id,
  parentId,
  version,
});

/**
 * Diff a fixture. The rows' `parentId` describes the plan as the server has it, from which the
 * baseline membership is derived — the panel passes the same thing, except just after a save, where
 * it passes what it just committed (which is the case `advances past a saved change` covers).
 */
function diff(rows: Row[], checked: string[], baseline?: string[]) {
  const byId = new Map(rows.map((r) => [r.id, { id: r.id, version: r.version }]));
  const current = new Set(baseline ?? rows.filter((r) => r.parentId === SUMMARY).map((r) => r.id));
  return membershipDiff(SUMMARY, current, new Set(checked), byId);
}

describe('membershipDiff', () => {
  it('is empty when nothing changed', () => {
    expect(diff([row('s1'), row('a', 's1'), row('b')], ['a'])).toEqual([]);
  });

  it('files a newly ticked activity under the summary', () => {
    expect(diff([row('s1'), row('a'), row('b')], ['a'])).toEqual([
      { id: 'a', parentId: 's1', version: 1 },
    ]);
  });

  // Un-ticking means "not in this summary". The panel never recorded a former parent, so promoting
  // to the top level is the only honest inverse.
  it('returns an un-ticked member to the TOP LEVEL, not to a previous parent', () => {
    expect(diff([row('s1'), row('a', 's1')], [])).toEqual([
      { id: 'a', parentId: null, version: 1 },
    ]);
  });

  it('handles adds and removes in one batch', () => {
    const changes = diff([row('s1'), row('a', 's1'), row('b')], ['b']);
    expect(changes).toHaveLength(2);
    expect(changes).toContainEqual({ id: 'a', parentId: null, version: 1 });
    expect(changes).toContainEqual({ id: 'b', parentId: 's1', version: 1 });
  });

  // The endpoint is all-or-nothing and per-row optimistic-locked: every unnecessary row is another
  // chance for someone else's edit to reject a save that did not touch it.
  it('never sends an unchanged row', () => {
    const rows = [row('s1'), row('a', 's1'), row('b', 's1'), row('c'), row('d')];
    expect(diff(rows, ['a', 'b', 'c']).map((c) => c.id)).toEqual(['c']);
  });

  it('carries each row at its LATEST read version, not a stale one', () => {
    expect(diff([row('s1'), row('a', null, 7)], ['a'])).toEqual([
      { id: 'a', parentId: 's1', version: 7 },
    ]);
  });

  it('leaves an activity filed under a DIFFERENT summary alone when it is not ticked', () => {
    expect(diff([row('s1'), row('s2'), row('a', 's2')], [])).toEqual([]);
  });

  it('steals an activity from another summary when it IS ticked', () => {
    expect(diff([row('s1'), row('s2'), row('a', 's2')], ['a'])).toEqual([
      { id: 'a', parentId: 's1', version: 1 },
    ]);
  });

  it('never files the summary under itself, even if it is ticked', () => {
    expect(diff([row('s1'), row('a')], ['s1', 'a'])).toEqual([
      { id: 'a', parentId: 's1', version: 1 },
    ]);
  });

  // A checked id the plan does not know about (a row deleted underneath us) is dropped rather than
  // sent: the server would 404 the whole batch, losing the user's other changes to say so.
  it('ignores a checked id that is not in the plan', () => {
    expect(diff([row('s1'), row('a')], ['a', 'ghost'])).toEqual([
      { id: 'a', parentId: 's1', version: 1 },
    ]);
  });

  /**
   * The window between a save succeeding and the refetch landing. The rows still say `parentId:
   * null`, but the caller knows better and passes the committed baseline — so the change is not
   * re-sent…
   */
  it('advances past a saved change the refetch has not delivered yet', () => {
    expect(diff([row('s1'), row('a')], ['a'], ['a'])).toEqual([]);
  });

  /** …and un-ticking it in that same window is still a real change, not a no-op. */
  it('still sees an un-tick of a just-saved row in that window', () => {
    expect(diff([row('s1'), row('a')], [], ['a'])).toEqual([
      { id: 'a', parentId: null, version: 1 },
    ]);
  });
});
