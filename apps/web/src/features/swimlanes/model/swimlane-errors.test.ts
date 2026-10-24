import { describe, expect, it } from 'vitest';

import { swimlaneErrorText } from './swimlane-errors';

import { ApiFetchError } from '@/lib/api/client';

const err = (status: number, code: string, message = 'x', details?: unknown) =>
  new ApiFetchError(status, { code, message, ...(details ? { details } : {}) });

describe('swimlaneErrorText', () => {
  it('names the action for a lost pen', () => {
    expect(swimlaneErrorText('move Mechanical', err(423, 'LOCKED'))).toMatch(
      /^Could not move Mechanical: you no longer hold the plan’s edit lock/,
    );
  });

  it('explains a taken name, by reason or by code', () => {
    expect(swimlaneErrorText('add Civil', err(409, 'SWIMLANE_NAME_TAKEN'))).toMatch(
      /already has that name/,
    );
    expect(
      swimlaneErrorText('add Civil', err(409, 'CONFLICT', 'x', { reason: 'SWIMLANE_NAME_TAKEN' })),
    ).toMatch(/already has that name/);
  });

  it('explains the limit, a stale write and a vanished row', () => {
    expect(swimlaneErrorText('add Civil', err(422, 'SWIMLANE_LIMIT'))).toMatch(/at most 100/);
    expect(swimlaneErrorText('move X', err(409, 'STALE_VERSION'))).toMatch(
      /changed by someone else/,
    );
    expect(swimlaneErrorText('move X', err(404, 'NOT_FOUND'))).toMatch(/changed by someone else/);
  });

  it('keeps the server’s sentence for anything else, after the action', () => {
    expect(swimlaneErrorText('rename X', err(422, 'VALIDATION', 'Name too long.'))).toBe(
      'Could not rename X: Name too long.',
    );
    expect(swimlaneErrorText('rename X', new Error('Network down.'))).toBe(
      'Could not rename X: Network down.',
    );
  });
});
