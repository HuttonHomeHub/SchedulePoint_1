import { describe, expect, it } from 'vitest';

import { codeErrorText } from './code-errors';

import { ApiFetchError } from '@/lib/api/client';

const refusal = (status: number, reason?: string, message = 'Refused.') =>
  new ApiFetchError(status, {
    code: 'CONFLICT',
    message,
    ...(reason === undefined ? {} : { details: { reason } }),
  });

describe('codeErrorText', () => {
  it('names the action and says what to do for each reason the server gives', () => {
    expect(codeErrorText('add Area', refusal(409, 'CODE_TYPE_NAME_TAKEN'))).toBe(
      'Could not add Area: another code type already has that name (names are compared ignoring case).',
    );
    expect(codeErrorText('add L1', refusal(409, 'CODE_VALUE_TAKEN'), 'Area')).toContain(
      'Area already has a value with that short code',
    );
    expect(codeErrorText('add Area', refusal(422, 'CODE_TYPE_LIMIT'))).toContain(
      'at most 100 code types. Delete one you no longer use first.',
    );
    expect(codeErrorText('add L1', refusal(422, 'CODE_VALUE_LIMIT'), 'Area')).toContain(
      'Area holds at most 1,000 values.',
    );
  });

  it('says the swimlanes are made from the type, and to choose another source first', () => {
    expect(codeErrorText('delete Area', refusal(409, 'CODE_TYPE_IS_SWIMLANE_SOURCE'), 'Area')).toBe(
      'Could not delete Area: the swimlanes are made from Area. Choose another swimlane source first.',
    );
  });

  it('says to restore the parent first when a restore is refused for a deleted parent', () => {
    expect(codeErrorText('restore L1', refusal(409, 'PARENT_DELETED'), 'Area')).toBe(
      'Could not restore L1: restore Area first.',
    );
  });

  it('reads a lost pen, a stale write and a vanished row in plain words', () => {
    expect(codeErrorText('move Area', refusal(423))).toContain(
      'no longer hold the plan’s edit lock',
    );
    expect(codeErrorText('move Area', refusal(409, 'STALE_VERSION'))).toContain(
      'changed by someone else',
    );
    expect(codeErrorText('move Area', refusal(404))).toContain('changed by someone else');
  });

  it('keeps the server’s own sentence for anything it does not recognise', () => {
    expect(codeErrorText('add L1', refusal(422, undefined, 'Short code is too long.'))).toBe(
      'Could not add L1: Short code is too long.',
    );
    expect(codeErrorText('add L1', new Error('offline'))).toBe('Could not add L1: offline');
    expect(codeErrorText('add L1', 'nope')).toBe('Could not add L1: something went wrong.');
  });
});
