import { ACTIVITY_TYPE_LABELS, type ActivityType } from '@repo/types';
import { describe, expect, it, vi } from 'vitest';

import {
  barEdgeGate,
  edgeObjectReason,
  settleBarWrite,
  startEdgeAnnouncement,
  START_EDGE_FROZEN_REASON,
} from './bar-drag';

import { isResizeEligibleType } from '@/features/tsld/render/hit-test';

/**
 * **ADR-0170 D3/D6 — the one edge gate, and the one place a bar write is announced.**
 *
 * The gate is asserted per branch with its SPOKEN reason, because a refusal that says nothing is the
 * lit-but-inert shape this register keeps recording. The announcement is asserted per outcome
 * because the defect it replaces — success spoken before the write had settled — only shows when a
 * write fails.
 */

const task = { type: 'TASK' as const, actualStart: null, actualFinish: null };
const OPEN = { canEdit: true, reason: null };

describe('edgeObjectReason', () => {
  it('admits an ordinary task on both edges', () => {
    expect(edgeObjectReason(task, 'start')).toBeNull();
    expect(edgeObjectReason(task, 'finish')).toBeNull();
  });

  it.each([
    ['WBS_SUMMARY', /summary/i],
    ['START_MILESTONE', /milestone/i],
    ['FINISH_MILESTONE', /milestone/i],
    ['LEVEL_OF_EFFORT', /level-of-effort/i],
  ] as const)('refuses %s on both edges, with a reason naming the object', (type, reason) => {
    expect(edgeObjectReason({ ...task, type }, 'start')).toMatch(reason);
    expect(edgeObjectReason({ ...task, type }, 'finish')).toMatch(reason);
  });

  it('refuses the START edge — and only that edge — once an actual exists', () => {
    // The engine draws a started activity from its actual and ignores a hand-placed start, so a
    // start write would save an inert placement and move the finish. The finish is a duration the
    // engine still uses.
    for (const actual of [{ actualStart: '2026-03-02' }, { actualFinish: '2026-03-06' }]) {
      const started = { ...task, ...actual };
      expect(edgeObjectReason(started, 'start')).toBe(START_EDGE_FROZEN_REASON);
      expect(edgeObjectReason(started, 'finish')).toBeNull();
    }
  });
});

describe('the Gantt and the diagram agree on which types have a length to resize', () => {
  it.each(Object.keys(ACTIVITY_TYPE_LABELS) as ActivityType[])(
    '%s is refused on both edges exactly when the diagram offers no handle',
    (type) => {
      const eligible = isResizeEligibleType(type);
      for (const edge of ['start', 'finish'] as const) {
        expect(edgeObjectReason({ ...task, type }, edge) === null, `${type} ${edge}`).toBe(
          eligible,
        );
      }
    },
  );
});

describe('barEdgeGate', () => {
  it('puts the object’s reason before the reader’s', () => {
    // Telling a Viewer "your role cannot edit" about a milestone would be true and useless.
    const gate = barEdgeGate(
      { ...task, type: 'START_MILESTONE' },
      { canEdit: false, reason: 'Pen.' },
      'finish',
    );
    expect(gate).toEqual({
      resizable: false,
      reason: 'A milestone marks a moment, so it has no duration.',
    });
  });

  it('carries the reader’s reason when the object is fine', () => {
    expect(barEdgeGate(task, { canEdit: false, reason: 'Take the pen.' }, 'start')).toEqual({
      resizable: false,
      reason: 'Take the pen.',
    });
  });

  it('is resizable for an editable task', () => {
    expect(barEdgeGate(task, OPEN, 'start')).toEqual({ resizable: true, reason: null });
  });
});

describe('startEdgeAnnouncement', () => {
  it('is the diagram’s sentence', () => {
    expect(startEdgeAnnouncement('Pour', '04 Mar 2026', 3)).toBe(
      'Moved the start of “Pour” to 04 Mar 2026 (3 days, finish unchanged); dates will update.',
    );
    expect(startEdgeAnnouncement('Pour', '04 Mar 2026', 1)).toContain('(1 day,');
  });
});

describe('settleBarWrite', () => {
  const run = async (write: Promise<{ applied: boolean; conflict: string | null }>) => {
    const announce = vi.fn();
    await settleBarWrite(write, 'It worked.', 'Couldn’t do it.', announce);
    return announce;
  };

  it('announces the success sentence once the write has applied — and not before', async () => {
    let resolve!: (v: { applied: boolean; conflict: string | null }) => void;
    const announce = vi.fn();
    const settled = settleBarWrite(
      new Promise((r) => {
        resolve = r;
      }),
      'It worked.',
      'Couldn’t do it.',
      announce,
    );
    expect(announce).not.toHaveBeenCalled();
    resolve({ applied: true, conflict: null });
    await settled;
    expect(announce).toHaveBeenCalledExactlyOnceWith('It worked.');
  });

  it('announces the conflict, never the success, for a stale-version refusal (409)', async () => {
    const announce = await run(Promise.resolve({ applied: false, conflict: 'Stale.' }));
    expect(announce).toHaveBeenCalledExactlyOnceWith('Stale.');
  });

  it('says nothing more for a lost pen (423), which the pen path has already spoken for', async () => {
    const announce = await run(Promise.resolve({ applied: false, conflict: null }));
    expect(announce).not.toHaveBeenCalled();
  });

  it('announces the failure sentence when the write rejects, instead of leaving it unhandled', async () => {
    const announce = await run(Promise.reject(new Error('boom')));
    expect(announce).toHaveBeenCalledExactlyOnceWith('Couldn’t do it.');
  });
});
