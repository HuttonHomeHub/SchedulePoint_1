import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { barEdgeGate, edgeObjectReason, settleBarWrite, startEdgeFrozenReason } from './bar-drag';

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
      expect(edgeObjectReason(started, 'start')).toBe(startEdgeFrozenReason());
      expect(edgeObjectReason(started, 'finish')).toBeNull();
    }
  });
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

describe('one reason, one place', () => {
  it('says why a started activity’s start cannot move in exactly one source file', () => {
    // The handle and the typed `Start` cell must give the SAME sentence (ADR-0170 D3), which they
    // can only do by importing it. A second literal is how the two come to drift.
    const dir = __dirname.replace(/\/model$/, '');
    const needle = 'has started, so its start is its actual start';
    const sources: string[] = [];
    const walk = (d: string): void => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const full = join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) sources.push(full);
      }
    };
    walk(dir);
    const holders = sources.filter((f) => readFileSync(f, 'utf8').includes(needle));
    expect(holders.map((f) => f.slice(dir.length))).toEqual(['/model/bar-drag.ts']);
  });
});
