import type { ActivitySummary } from '@repo/types';
import { describe, expect, it, vi } from 'vitest';

import { cellWriteFields, commitCell, describeCommitFailure } from './cell-commit';
import { GANTT_EDITABLE_COLUMNS, type GanttCellKey } from './cell-edit';

import { ApiFetchError } from '@/lib/api/client';

/**
 * **M2-T3 — what a typed cell sends, and what it does when the server says no.**
 *
 * The mutation is injected, so the three outcomes the grid will really meet (200, 423, 409) are
 * three unit tests rather than three journeys. The journey still exists and still matters — a
 * mocked fetch accepts any `version`, so only a real server can prove the optimistic check is
 * actually armed — but it should not be where a status-code branch is first exercised.
 */

const EIGHT_HOUR = 8;

const activity = (over: Partial<ActivitySummary> = {}): ActivitySummary =>
  ({
    id: 'a1',
    name: 'Foundations',
    type: 'TASK',
    version: 7,
    durationDays: 5,
    durationMinutes: 2400,
    ...over,
  }) as unknown as ActivitySummary;

const apiError = (status: number, message = 'no') =>
  new ApiFetchError(status, { code: 'X', message });

describe('cellWriteFields', () => {
  it('sends a trimmed name, and refuses an empty one', () => {
    expect(cellWriteFields('name', '  Piling  ', EIGHT_HOUR)).toEqual({ name: 'Piling' });
    // Reachable by pressing Enter on a cleared cell, which is a slip rather than an intention.
    expect(cellWriteFields('name', '   ', EIGHT_HOUR)).toBeNull();
  });

  it('sends minutes for a sub-day duration when the calendar factor is known', () => {
    expect(cellWriteFields('duration', '4h', EIGHT_HOUR)).toEqual({ durationMinutes: 240 });
  });

  it('sends whole days when the factor is unavailable — the flag-off path', () => {
    expect(cellWriteFields('duration', '3', undefined)).toEqual({ durationDays: 3 });
  });

  it('refuses a duration the parser would not accept, rather than sending a guess', () => {
    expect(cellWriteFields('duration', '2 weeks', EIGHT_HOUR)).toBeNull();
  });

  it('accepts a percentage with or without its sign, and refuses one out of range', () => {
    expect(cellWriteFields('percentComplete', '40', EIGHT_HOUR)).toEqual({ percentComplete: 40 });
    expect(cellWriteFields('percentComplete', '40%', EIGHT_HOUR)).toEqual({ percentComplete: 40 });
    expect(cellWriteFields('percentComplete', '140', EIGHT_HOUR)).toBeNull();
    expect(cellWriteFields('percentComplete', '-1', EIGHT_HOUR)).toBeNull();
    expect(cellWriteFields('percentComplete', 'soon', EIGHT_HOUR)).toBeNull();
  });

  it('never PATCHes a computed date column', () => {
    // The engine owns `earlyStart`/`earlyFinish`. A client writing them would be asserting an answer
    // rather than an input; the typed-date cell writes the CONSTRAINT a drag writes, which is
    // `docs/specs/gantt-editing-gaps/` M3 and needs an ADR because it is a schedule semantic.
    // Refusing beats sending something plausible to a field the server recomputes.
    //
    // **This assertion is true of the WRITE and says nothing about the CELL**, which is exactly how
    // `docs/TECH_DEBT.md` #290 shipped: both keys were also listed in `GANTT_EDITABLE_COLUMNS`, so
    // the cell opened, took a keystroke and refused every value — and this test passed throughout,
    // pinning the dead end as correct. The case below is the one that can see it.
    expect(cellWriteFields('earlyStart', '2026-03-01', EIGHT_HOUR)).toBeNull();
    expect(cellWriteFields('earlyFinish', '2026-03-05', EIGHT_HOUR)).toBeNull();
  });

  /**
   * A value each key accepts, if it accepts anything at all.
   *
   * **Total over `GanttCellKey`, and the compiler is the enforcement** — a key added without a
   * sample fails to typecheck rather than being silently skipped by the loop below, which is how a
   * roster test comes to pass over a roster it is not reading (ADR-0093).
   */
  const ACCEPTED_SAMPLE: Record<GanttCellKey, string> = {
    name: 'Renamed',
    duration: '3d',
    percentComplete: '50',
    earlyStart: '2026-03-01',
    earlyFinish: '2026-03-05',
  };

  it('never lists a column as editable that the commit path refuses outright', () => {
    /**
     * **`docs/TECH_DEBT.md` #290, and it is the RELATIONSHIP that was wrong rather than either
     * side.** `GANTT_EDITABLE_COLUMNS` decides whether a cell opens; `cellWriteFields` decides
     * whether anything can be written. Both files were internally correct and defensible, and
     * nothing compared them — so `earlyStart`/`earlyFinish` were listed as editable while the
     * commit returned `null` for every input, and the grid answered "That value is not something
     * this cell accepts." to a correctly-formatted date. Live since `web-v0.92.0`.
     *
     * Asserting "the two keys are absent" would fix today and not the class. This asks the
     * question that was never asked: for every column the grid will OPEN, is there any value it
     * takes? A key whose editor can only ever refuse is an entry point with no capability —
     * ADR-0081's shape inverted — and the planner is told they typed it wrong.
     */
    const listed = Object.entries(GANTT_EDITABLE_COLUMNS).filter(
      (entry): entry is [string, GanttCellKey] => entry[1] !== undefined,
    );
    // A pinned positive: an empty roster would satisfy the loop below perfectly, and a green run
    // could not then tell "every editable column works" from "no column is editable".
    expect(listed.length).toBeGreaterThan(0);

    for (const [column, key] of listed) {
      expect(
        cellWriteFields(key, ACCEPTED_SAMPLE[key], EIGHT_HOUR),
        `column "${column}" opens an editor but cellWriteFields("${key}") refuses every value`,
      ).not.toBeNull();
    }
  });
});

describe('describeCommitFailure', () => {
  it('names the pen for a 423, and does not mark the row stale', () => {
    expect(describeCommitFailure(apiError(423))).toEqual({
      message: 'Someone else is editing this plan.',
      stale: false,
    });
  });

  it('marks a 409 stale, because retrying with the version we hold would fail identically', () => {
    expect(describeCommitFailure(apiError(409))).toMatchObject({ stale: true });
  });

  it("passes the server's own message through for anything else", () => {
    // A 422 from the DTO says exactly which field and why. Replacing it with "something went wrong"
    // throws away the only part a planner could act on.
    expect(describeCommitFailure(apiError(422, 'durationMinutes must not be less than 0'))).toEqual(
      {
        message: 'durationMinutes must not be less than 0',
        stale: false,
      },
    );
  });

  it('has a sentence for a non-API failure too', () => {
    expect(describeCommitFailure(new Error('offline'))).toMatchObject({
      message: 'That change could not be saved.',
    });
  });
});

describe('commitCell', () => {
  it('sends the row version, so a concurrent edit is caught rather than overwritten', async () => {
    const update = vi.fn().mockResolvedValue(activity({ durationMinutes: 240 }));
    const result = await commitCell({
      activity: activity(),
      key: 'duration',
      text: '4h',
      hoursPerDay: EIGHT_HOUR,
      update,
    });

    // A `patch` slice, not a whole definition. `useUpdateActivity` would have sent the latter and a
    // rename could then quietly rewrite a constraint — the partial PATCH exists for exactly the
    // per-scope reason ADR-0060 §4 records, and a cell is that argument at its smallest.
    expect(update).toHaveBeenCalledWith({
      activityId: 'a1',
      version: 7,
      patch: { durationMinutes: 240 },
    });
    expect(result).toMatchObject({ ok: true });
  });

  it('refuses locally without calling the server when the text is not sendable', async () => {
    const update = vi.fn();
    const result = await commitCell({
      activity: activity(),
      key: 'duration',
      text: '2 weeks',
      hoursPerDay: EIGHT_HOUR,
      update,
    });

    // A round trip to learn what the parser already knew is latency spent on nothing, and the
    // server's 422 would be about a field rather than about the grammar the planner typed in.
    expect(update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false });
  });

  it('turns a refusal into a result, never an exception', async () => {
    // The cell-edit model has an `error` state that keeps the planner's text; a thrown error would
    // go around it and the text would be lost.
    const update = vi.fn().mockRejectedValue(apiError(423));
    const result = await commitCell({
      activity: activity(),
      key: 'name',
      text: 'Piling',
      hoursPerDay: EIGHT_HOUR,
      update,
    });

    expect(result).toEqual({
      ok: false,
      failure: { message: 'Someone else is editing this plan.', stale: false },
    });
  });
});
