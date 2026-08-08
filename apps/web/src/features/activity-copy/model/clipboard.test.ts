import type { ActivitySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { missingNote, resolveClipboard, type ClipboardContents } from './clipboard';

/**
 * **The clipboard resolves ids against the live plan** (`docs/specs/activity-copy-paste/` M3-T1).
 *
 * The assertion that matters is that a **stale id is reported, not silently dropped**. A planner who
 * copies six activities, deletes two, and pastes four has been told something false by silence — and
 * the four that landed look completely correct, so nothing on screen contradicts it.
 */
function activity(id: string, name: string): ActivitySummary {
  return { id, name, planId: 'p1' } as unknown as ActivitySummary;
}

function clipboard(ids: string[]): ClipboardContents {
  return { planId: 'p1', activityIds: ids };
}

describe('resolveClipboard', () => {
  it('returns the live rows, not the ones captured at copy time', () => {
    // Ids rather than a snapshot: a duration edit or a recalculation between copy and paste would
    // otherwise recreate the plan as it was minutes ago, with nothing saying so.
    const live = [activity('a', 'Excavate (renamed since)'), activity('b', 'Pour')];
    const { present } = resolveClipboard(clipboard(['a', 'b']), live);
    expect(present.map((a) => a.name)).toEqual(['Excavate (renamed since)', 'Pour']);
  });

  it('counts ids that no longer exist rather than quietly shortening the paste', () => {
    const live = [activity('a', 'Excavate')];
    const resolved = resolveClipboard(clipboard(['a', 'gone-1', 'gone-2']), live);
    expect(resolved.present.map((a) => a.id)).toEqual(['a']);
    expect(resolved.missingCount).toBe(2);
  });

  it('preserves the CLIPBOARD’s order, not the live list’s', () => {
    // So a paste is identical every time, and a chain selected in a particular order recreates in
    // that order rather than in whatever order the plan happens to list its activities.
    const live = [activity('b', 'Pour'), activity('a', 'Excavate'), activity('c', 'Strike')];
    const { present } = resolveClipboard(clipboard(['c', 'a', 'b']), live);
    expect(present.map((a) => a.id)).toEqual(['c', 'a', 'b']);
  });

  it('resolves an entirely stale clipboard to nothing present and everything missing', () => {
    const resolved = resolveClipboard(clipboard(['x', 'y']), [activity('a', 'Excavate')]);
    expect(resolved.present).toEqual([]);
    expect(resolved.missingCount).toBe(2);
  });
});

describe('missingNote', () => {
  it('is empty when nothing is missing, so a caller can concatenate unconditionally', () => {
    expect(missingNote(0)).toBe('');
  });

  it('is singular at one and plural above it', () => {
    expect(missingNote(1)).toContain('1 copied activity no longer exists');
    expect(missingNote(3)).toContain('3 copied activities no longer exist');
  });

  it('leads with a space, because it is appended to the success sentence', () => {
    // It rides the SAME announcement rather than a second live-region write, which would collapse
    // to whichever landed last (TECH_DEBT #104) — so the planner would hear one fact or the other.
    expect(missingNote(1).startsWith(' ')).toBe(true);
  });
});
