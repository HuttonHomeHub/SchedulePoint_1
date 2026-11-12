import { describe, expect, it } from 'vitest';

import { fieldsClearedByEdit, progressRefusal } from './progress-refusal';

import { ApiFetchError } from '@/lib/api/client';

const refused = (details: unknown, message = 'The server’s own sentence.', status = 422) =>
  new ApiFetchError(status, { code: 'VALIDATION_ERROR', message, details });

const AFTER = {
  reason: 'ACTUAL_AFTER_DATA_DATE',
  dataDate: '2026-11-10',
  latestActual: '2026-11-14',
};

describe('progressRefusal', () => {
  it('names the finish, both dates, and the planner’s own remedy', () => {
    expect(
      progressRefusal(refused({ ...AFTER, fields: ['actualFinish'] }), { canMovePlanDates: true }),
    ).toMatchObject({
      fields: ['actualFinish'],
      reason: 'ACTUAL_AFTER_DATA_DATE',
      sentence:
        'Actual finish, 14 Nov 2026, is after the plan’s data date, 10 Nov 2026. ' +
        'Move the data date (the Planned start box in Edit plan details) to 14 Nov 2026 or later, ' +
        'then save again. What you typed stays here until you close the editor.',
    });
  });

  it('tells a reader who cannot move the data date to ask a planner', () => {
    const { sentence } = progressRefusal(refused({ ...AFTER, fields: ['actualStart'] }), {
      canMovePlanDates: false,
    });
    expect(sentence).toContain('Actual start, 14 Nov 2026, is after');
    expect(sentence).toContain(
      'A planner needs to move the data date to 14 Nov 2026 or later first.',
    );
    expect(sentence).not.toContain('Edit plan details');
  });

  it('names both fields, in the form’s order, whatever order the server listed them', () => {
    const refusal = progressRefusal(
      refused({ ...AFTER, fields: ['actualFinish', 'actualStart'] }),
      {
        canMovePlanDates: true,
      },
    );
    expect(refusal.fields).toEqual(['actualStart', 'actualFinish']);
    expect(refusal.sentence).toMatch(
      /^Actual start and Actual finish are after the plan’s data date/,
    );
    expect(refusal.fieldMessages).toEqual({
      actualStart: refusal.sentence,
      actualFinish: 'Also after the data date. See Actual start.',
    });
  });

  it('places another field rule on its field and keeps the server’s sentence', () => {
    expect(
      progressRefusal(
        refused(
          { reason: 'FINISH_BEFORE_START', fields: ['actualFinish'] },
          'Actual finish cannot precede actual start.',
        ),
        { canMovePlanDates: true },
      ),
    ).toMatchObject({
      fields: ['actualFinish'],
      reason: 'FINISH_BEFORE_START',
      sentence: 'Actual finish cannot precede actual start.',
      fieldMessages: { actualFinish: 'Actual finish cannot precede actual start.' },
    });
    expect(
      progressRefusal(refused({ reason: 'RESUME_BEFORE_SUSPEND', fields: ['resumeDate'] }), {
        canMovePlanDates: true,
      }).fields,
    ).toEqual(['resumeDate']);
  });

  it('keeps the server’s message and no field when details are missing, unknown or malformed', () => {
    const none = {
      fields: [],
      sentence: 'The server’s own sentence.',
      reason: null,
      fieldMessages: {},
    };
    for (const details of [
      undefined,
      null,
      'text',
      {},
      { fields: [] },
      { fields: ['somethingElse'] },
      { fields: 'actualFinish' },
    ]) {
      expect(progressRefusal(refused(details), { canMovePlanDates: true })).toEqual(none);
    }
    // The right reason without parseable dates falls back to the server's sentence, still placed.
    expect(
      progressRefusal(refused({ reason: AFTER.reason, fields: ['actualFinish'] }), {
        canMovePlanDates: true,
      }),
    ).toMatchObject({ fields: ['actualFinish'], sentence: 'The server’s own sentence.' });
  });

  it('ignores anything that is not a 422 from the API', () => {
    const details = { ...AFTER, fields: ['actualFinish'] };
    expect(
      progressRefusal(refused(details, 'Conflict', 409), { canMovePlanDates: true }).fields,
    ).toEqual([]);
    expect(progressRefusal(new Error('network down'), { canMovePlanDates: true })).toMatchObject({
      fields: [],
      sentence: 'network down',
    });
  });
});

describe('fieldsClearedByEdit', () => {
  const finishRefusal = (reason: string) =>
    progressRefusal(refused({ reason, fields: ['actualFinish'] }), { canMovePlanDates: true });

  it('clears only the edited field’s own error', () => {
    const refusal = progressRefusal(refused({ ...AFTER, fields: ['actualFinish'] }), {
      canMovePlanDates: true,
    });
    expect(fieldsClearedByEdit(refusal, 'actualFinish')).toEqual(['actualFinish']);
    expect(fieldsClearedByEdit(refusal, 'actualStart')).toEqual(['actualStart']);
    expect(fieldsClearedByEdit(refusal, 'percentComplete')).toEqual([]);
    expect(fieldsClearedByEdit(null, 'resumeDate')).toEqual(['resumeDate']);
  });

  it('lets either end of a finish/start relation clear it', () => {
    for (const reason of ['FINISH_BEFORE_START', 'FINISH_WITHOUT_START']) {
      const refusal = finishRefusal(reason);
      expect(fieldsClearedByEdit(refusal, 'actualStart')).toEqual(['actualStart', 'actualFinish']);
      expect(fieldsClearedByEdit(refusal, 'actualFinish')).toEqual(['actualFinish']);
      expect(fieldsClearedByEdit(refusal, 'resumeDate')).toEqual(['resumeDate']);
    }
  });
});
