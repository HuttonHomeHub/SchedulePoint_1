import { describe, expect, it } from 'vitest';

import { flagSentences, movementSentence, movementTone } from './standing-copy';

/**
 * **One case per state, because the failure this section exists to prevent is a state with no
 * sentence** — which renders as a dash, an empty cell, or nothing at all, and reads to a planner as
 * the screen being broken rather than as "there is nothing here yet" (ADR-0061's `ContextStrip`
 * finding).
 *
 * The five `NOT_ASSESSABLE` reasons are asserted to be **five different sentences**, not merely
 * non-empty: a `Record` with the same string against two keys type-checks perfectly and collapses
 * two facts with different remedies into one, which is the defect the union exists to prevent one
 * layer down.
 */
describe('movementSentence', () => {
  it('names the baseline and the direction, in words, when the finish has moved later', () => {
    const sentence = movementSentence({
      kind: 'MOVED',
      workingDays: 14,
      baselineFinish: '2026-09-25',
      baselineName: 'Contract award',
    });
    // The WORD carries the direction (WCAG 1.4.1). A reader who cannot distinguish the tone, or is
    // reading a printout, or is listening, still learns which way it went.
    expect(sentence).toContain('later');
    expect(sentence).toContain('14 working days');
    expect(sentence).toContain('Contract award');
    expect(sentence).not.toContain('-');
  });

  it('says "earlier" rather than printing a negative number', () => {
    const sentence = movementSentence({
      kind: 'MOVED',
      workingDays: -3,
      baselineFinish: '2026-09-25',
      baselineName: 'Contract award',
    });
    expect(sentence).toContain('earlier');
    // `-3` needs a sign convention the reader has to have been told; "3 working days earlier"
    // does not. The minus must not survive into the copy.
    expect(sentence).not.toContain('-3');
    expect(sentence).toContain('3 working days');
  });

  it('says "working day" singular for one', () => {
    expect(
      movementSentence({
        kind: 'MOVED',
        workingDays: 1,
        baselineFinish: '2026-09-25',
        baselineName: 'B',
      }),
    ).toContain('1 working day later');
  });

  it('names the baseline for an unchanged finish, rather than saying nothing', () => {
    const sentence = movementSentence({
      kind: 'UNCHANGED',
      baselineFinish: '2026-09-25',
      baselineName: 'Contract award',
    });
    expect(sentence).toContain('Contract award');
    expect(sentence.length).toBeGreaterThan(0);
  });

  it.each([
    ['NO_BASELINE', /capture one/i],
    ['BASELINE_HAS_NO_FINISH', /capture a new one/i],
    ['PLAN_NOT_SCHEDULED', /not yet calculated/i],
    ['PLAN_EMPTY', /no activities/i],
    ['CALENDAR_UNUSABLE', /calendar/i],
  ] as const)('gives %s a sentence naming what to do about it', (reason, expected) => {
    const sentence = movementSentence({ kind: 'NOT_ASSESSABLE', reason });
    expect(sentence).toMatch(expected);
    // Never a dash, never blank — the whole point.
    expect(sentence.trim().length).toBeGreaterThan(10);
  });

  it('gives the five reasons five DIFFERENT sentences', () => {
    const reasons = [
      'NO_BASELINE',
      'BASELINE_HAS_NO_FINISH',
      'PLAN_NOT_SCHEDULED',
      'PLAN_EMPTY',
      'CALENDAR_UNUSABLE',
    ] as const;
    const sentences = reasons.map((reason) => movementSentence({ kind: 'NOT_ASSESSABLE', reason }));
    // Each reason has a different remedy. Two sharing a sentence would type-check and would tell
    // one of the two readers to do the wrong thing.
    expect(new Set(sentences).size).toBe(reasons.length);
  });
});

describe('movementTone', () => {
  it('warns only when the finish has moved LATER', () => {
    const base = { baselineFinish: '2026-09-25', baselineName: 'B' } as const;
    expect(movementTone({ kind: 'MOVED', workingDays: 5, ...base })).toBe('warning');
    // Finishing early is not a success in construction — it usually means somebody's logic is
    // wrong — so the screen holds no opinion about it.
    expect(movementTone({ kind: 'MOVED', workingDays: -5, ...base })).toBe('neutral');
    expect(movementTone({ kind: 'UNCHANGED', ...base })).toBe('neutral');
    expect(movementTone({ kind: 'NOT_ASSESSABLE', reason: 'NO_BASELINE' })).toBe('neutral');
  });
});

describe('flagSentences', () => {
  it('says nothing for a plan with no flags', () => {
    expect(flagSentences({})).toEqual([]);
  });

  it('renders a known flag in words, with the count', () => {
    expect(flagSentences({ constraintViolated: 2 })).toEqual(['2 constraints broken by logic']);
  });

  it('agrees with itself on singular and plural', () => {
    expect(flagSentences({ constraintViolated: 1 })).toEqual(['1 constraint broken by logic']);
    expect(flagSentences({ loeNoSpan: 1 })).toEqual(['1 level-of-effort activity with no span']);
    expect(flagSentences({ loeNoSpan: 3 })).toEqual(['3 level-of-effort activities with no span']);
  });

  it('RENDERS an unrecognised flag rather than dropping it', () => {
    // The engine may grow a flag before this screen learns its name. A row that silently omits it
    // tells the reader everything is fine, which is the failure this epic exists to remove. A raw
    // key is ugly and honest.
    expect(flagSentences({ somethingNew: 4 })).toEqual(['somethingNew: 4']);
  });

  it('drops a zero, which the server should never send but the type permits', () => {
    expect(flagSentences({ constraintViolated: 0, visualConflict: 2 })).toEqual([
      '2 hand-placed activities in conflict',
    ]);
  });
});
