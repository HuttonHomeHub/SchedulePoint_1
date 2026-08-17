import { describe, expect, it } from 'vitest';

import {
  GANTT_CELL_SCOPES,
  IDLE,
  isCellDirty,
  isCellOpen,
  openCell,
  reduceCellEdit,
  type GanttCellEditState,
  type GanttCellTarget,
} from './cell-edit';

/**
 * **M2-T2 — the cell-edit model.**
 *
 * The interesting cases are all timing, which is why the model is pure: each one below is a
 * two-line sequence here and would be a flaky browser test anywhere else.
 *
 * The one that earns the file is `reseed` on a cell the planner has typed into. That is
 * `docs/TECH_DEBT.md` #83 — a keystroke and a refetch are independent events, and asking a captured
 * dirty flag reads a stale `false` and silently discards the keystroke. It was found by
 * `apps/web/e2e-sub-day/` on its first run, because an automated journey types and submits faster
 * than a human and hits a window hand-testing never does. Here it is a unit test.
 */

const DURATION: GanttCellTarget = { activityId: 'a1', key: 'duration' };
const NAME: GanttCellTarget = { activityId: 'a1', key: 'name' };

/** Apply a sequence, so a test reads as the story it is about. */
const run = (from: GanttCellEditState, ...actions: Parameters<typeof reduceCellEdit>[1][]) =>
  actions.reduce(reduceCellEdit, from);

const opened = (target = DURATION, seed = '5 d') =>
  reduceCellEdit(IDLE, { type: 'begin', target, seed });

describe('scopes', () => {
  it('gives every editable cell exactly one scope, and progress is not a definition write', () => {
    // ADR-0060 Q-C: progress is role-gated and deliberately NOT pen-gated. A grid-wide "can edit"
    // would collapse the two and take a Contributor's only write away while a Planner holds the pen.
    expect(GANTT_CELL_SCOPES.percentComplete).toBe('progress');
    for (const key of ['name', 'duration', 'earlyStart', 'earlyFinish'] as const) {
      expect(GANTT_CELL_SCOPES[key]).toBe('definition');
    }
  });
});

describe('opening and typing', () => {
  it('seeds the text from what the row reads, so opening changes nothing', () => {
    const state = opened();
    expect(state).toMatchObject({ status: 'editing', text: '5 d', seed: '5 d' });
    expect(isCellDirty(state)).toBe(false);
  });

  it('keeps the seed while the text moves, because the seed is what dirtiness is measured against', () => {
    const state = run(opened(), { type: 'change', text: '4h' });
    expect(state).toMatchObject({ status: 'editing', text: '4h', seed: '5 d' });
    expect(isCellDirty(state)).toBe(true);
  });

  it('reports which cell is open, and only that one', () => {
    const state = opened(DURATION);
    expect(openCell(state)).toEqual(DURATION);
    expect(isCellOpen(state, DURATION)).toBe(true);
    expect(isCellOpen(state, NAME)).toBe(false);
    expect(isCellOpen(state, { activityId: 'a2', key: 'duration' })).toBe(false);
  });

  it('moves to another cell, discarding the first — one open cell is all this can represent', () => {
    const state = run(
      opened(DURATION),
      { type: 'change', text: '4h' },
      {
        type: 'begin',
        target: NAME,
        seed: 'Foundations',
      },
    );
    expect(state).toMatchObject({ status: 'editing', target: NAME, text: 'Foundations' });
  });
});

describe('cancelling', () => {
  it('discards the typed text on Escape', () => {
    const state = run(opened(), { type: 'change', text: '4h' }, { type: 'cancel' });
    expect(state).toEqual(IDLE);
  });
});

describe('committing', () => {
  it('goes to committing on Enter and to idle when the write lands', () => {
    const inFlight = run(opened(), { type: 'change', text: '4h' }, { type: 'commit' });
    expect(inFlight).toMatchObject({ status: 'committing', text: '4h' });
    expect(reduceCellEdit(inFlight, { type: 'resolved' })).toEqual(IDLE);
  });

  it('ignores typing and Escape while the write is in flight', () => {
    // Letting Escape win here would show the planner the OLD value while the new one lands a moment
    // later — a grid that lies about what the plan says. Refused rather than raced.
    const inFlight = run(opened(), { type: 'change', text: '4h' }, { type: 'commit' });
    expect(reduceCellEdit(inFlight, { type: 'cancel' })).toBe(inFlight);
    expect(reduceCellEdit(inFlight, { type: 'change', text: '9h' })).toBe(inFlight);
    expect(reduceCellEdit(inFlight, { type: 'begin', target: NAME, seed: 'x' })).toBe(inFlight);
  });

  it('keeps the planner text when the write is refused', () => {
    // A 423 from the pen, a 409 from the version, a 422 from the parser — all land here. Clearing
    // the field would make the planner retype work the server merely declined to accept yet.
    const refused = run(
      opened(),
      { type: 'change', text: '4h' },
      { type: 'commit' },
      {
        type: 'failed',
        message: 'Someone else is editing this plan.',
      },
    );
    expect(refused).toMatchObject({
      status: 'error',
      text: '4h',
      message: 'Someone else is editing this plan.',
    });
  });

  it('clears the message on the next keystroke and returns to editing', () => {
    const fixed = run(
      opened(),
      { type: 'change', text: '4h' },
      { type: 'commit' },
      { type: 'failed', message: 'nope' },
      { type: 'change', text: '4h 30m' },
    );
    expect(fixed).toMatchObject({ status: 'editing', text: '4h 30m', seed: '5 d' });
    expect(fixed).not.toHaveProperty('message');
  });

  it('does nothing on resolved or failed when nothing is in flight', () => {
    const editing = opened();
    expect(reduceCellEdit(editing, { type: 'resolved' })).toBe(editing);
    expect(reduceCellEdit(editing, { type: 'failed', message: 'x' })).toBe(editing);
    expect(reduceCellEdit(IDLE, { type: 'commit' })).toBe(IDLE);
  });
});

describe('reseeding while a cell is open — TECH_DEBT #83', () => {
  it('takes the new value when the planner has not typed', () => {
    // A recalculation moved the row underneath an untouched cell. Showing the stale value would be
    // its own small lie, so an untouched cell follows.
    const state = run(opened(DURATION, '5 d'), {
      type: 'reseed',
      target: DURATION,
      seed: '6 d',
    });
    expect(state).toMatchObject({ status: 'editing', text: '6 d', seed: '6 d' });
    expect(isCellDirty(state)).toBe(false);
  });

  it('NEVER overwrites text the planner typed', () => {
    // The defect, stated as an assertion. A dirty flag captured by the wrong render reads `false`
    // here and this becomes '6 d' — the planner's `4h` gone, with no error and no cue.
    const state = run(
      opened(DURATION, '5 d'),
      { type: 'change', text: '4h' },
      {
        type: 'reseed',
        target: DURATION,
        seed: '6 d',
      },
    );
    expect(state).toMatchObject({ status: 'editing', text: '4h' });
  });

  it('treats text typed to exactly the seed as untouched, losing nothing either way', () => {
    // The one case the value comparison gets "wrong" and it costs nothing: the two strings are the
    // same, so following the refresh and keeping the typing are the same outcome.
    const state = run(
      opened(DURATION, '5 d'),
      { type: 'change', text: '5 d' },
      {
        type: 'reseed',
        target: DURATION,
        seed: '6 d',
      },
    );
    expect(state).toMatchObject({ text: '6 d', seed: '6 d' });
  });

  it('ignores a reseed aimed at a different cell', () => {
    const state = opened(DURATION, '5 d');
    expect(reduceCellEdit(state, { type: 'reseed', target: NAME, seed: 'x' })).toBe(state);
    expect(
      reduceCellEdit(state, {
        type: 'reseed',
        target: { activityId: 'a2', key: 'duration' },
        seed: '9 d',
      }),
    ).toBe(state);
  });

  it('ignores a reseed while a write is in flight or after a refusal', () => {
    // Both hold text the planner is responsible for: one is on its way to the server, the other is
    // waiting to be corrected. A refresh must not take either away.
    const inFlight = run(opened(), { type: 'change', text: '4h' }, { type: 'commit' });
    expect(reduceCellEdit(inFlight, { type: 'reseed', target: DURATION, seed: '6 d' })).toBe(
      inFlight,
    );

    const refused = reduceCellEdit(inFlight, { type: 'failed', message: 'nope' });
    expect(reduceCellEdit(refused, { type: 'reseed', target: DURATION, seed: '6 d' })).toBe(
      refused,
    );
  });
});
