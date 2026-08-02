import { describe, expect, it, vi } from 'vitest';

/**
 * `generalBody` with `VITE_SUB_DAY_DURATIONS` **on** (ADR-0070).
 *
 * Its own file because the flag is a build-time constant: `scope-bodies.test.ts` runs flag-off and
 * is the rollback contract — it must keep asserting that the body sends `durationDays`. This suite
 * asserts the other half, that a resolved working-hours factor makes the same builder send exact
 * minutes instead, and **never both** (the API rejects that pairing by design).
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  SUB_DAY_DURATIONS_ENABLED: true,
}));

const { generalBody } = await import('./scope-bodies');

const general = {
  name: 'Pour slab',
  code: 'A100',
  type: 'TASK' as const,
  durationType: 'FIXED_DURATION_AND_UNITS_TIME' as const,
  duration: '5',
  parentId: '',
  description: '',
};

/** An eight-hour working day — 480 minutes, not 1440 (ADR-0068). */
const EIGHT = 8;

describe('generalBody — sub-day durations', () => {
  it('sends exact minutes once the factor is known', () => {
    // The point of the epic: a four-hour lift is 240 minutes, not `durationDays: 0`.
    expect(generalBody({ ...general, duration: '4h' }, EIGHT).durationMinutes).toBe(240);
    expect(generalBody({ ...general, duration: '2d 4h' }, EIGHT).durationMinutes).toBe(1200);
    expect(generalBody({ ...general, duration: '5' }, EIGHT).durationMinutes).toBe(2400);
  });

  it('reads a day on the activity’s OWN calendar', () => {
    expect(generalBody({ ...general, duration: '1' }, 24).durationMinutes).toBe(1440);
    expect(generalBody({ ...general, duration: '1' }, 7.5).durationMinutes).toBe(450);
  });

  it('never sends both duration fields', () => {
    const body = generalBody({ ...general, duration: '4h' }, EIGHT);
    expect(body).not.toHaveProperty('durationDays');
  });

  it('falls back to whole days when the factor is unknown', () => {
    // The calendar list has not resolved. Days is the one unit that needs no factor.
    const body = generalBody({ ...general, duration: '5' });
    expect(body.durationDays).toBe(5);
    expect(body).not.toHaveProperty('durationMinutes');
  });

  it('omits the duration entirely rather than zeroing it when the text is unreadable', () => {
    const body = generalBody({ ...general, duration: 'soon' }, EIGHT);
    expect(body).not.toHaveProperty('durationMinutes');
    expect(body).not.toHaveProperty('durationDays');
  });

  it('still forces 0 for a duration-derived type, factor or no factor', () => {
    expect(
      generalBody({ ...general, type: 'START_MILESTONE', duration: '4h' }, EIGHT).durationDays,
    ).toBe(0);
  });
});
