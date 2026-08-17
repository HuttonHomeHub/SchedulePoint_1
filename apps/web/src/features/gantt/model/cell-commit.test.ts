import type { ActivitySummary } from '@repo/types';
import { describe, expect, it, vi } from 'vitest';

import { cellWriteFields, commitCell, describeCommitFailure } from './cell-commit';

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
    // rather than an input; the typed-date cell writes the CONSTRAINT a drag writes (M2-T3b). Until
    // that lands, refusing beats sending something plausible to a field the server recomputes.
    expect(cellWriteFields('earlyStart', '2026-03-01', EIGHT_HOUR)).toBeNull();
    expect(cellWriteFields('earlyFinish', '2026-03-05', EIGHT_HOUR)).toBeNull();
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
