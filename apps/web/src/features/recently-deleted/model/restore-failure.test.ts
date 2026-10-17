import { describe, expect, it } from 'vitest';

import { describeRestoreFailure } from './restore-failure';

import { ApiFetchError } from '@/lib/api/client';

const conflict = (details: unknown) =>
  new ApiFetchError(409, { code: 'CONFLICT', message: 'Restore the calendar first.', details });

describe('describeRestoreFailure — CALENDAR_DELETED (ADR-0200)', () => {
  it.each(['plan', 'project', 'client', 'resource'] as const)(
    'names the calendar for a %s, with no library link',
    (kind) => {
      const failure = describeRestoreFailure(
        conflict({
          reason: 'CALENDAR_DELETED',
          calendar: { id: 'c1', name: 'Mon-Wed', deleteBatchId: 'b1' },
        }),
        kind,
      );
      expect(failure).toEqual({
        message:
          'It uses the calendar “Mon-Wed”, which is deleted. Restore that calendar first, then restore this.',
        library: null,
      });
    },
  );

  it('says the calendar is gone when the server could not name it', () => {
    const failure = describeRestoreFailure(
      conflict({
        reason: 'CALENDAR_DELETED',
        calendar: { id: 'c1', name: null, deleteBatchId: null },
      }),
      'plan',
    );
    expect(failure).toEqual({
      message: 'It uses a calendar that no longer exists.',
      library: null,
    });
  });

  it('leaves a name clash with the server’s sentence and a library link', () => {
    const failure = describeRestoreFailure(
      new ApiFetchError(409, {
        code: 'CONFLICT',
        message: 'A resource named “Crane A” already exists.',
        details: { reason: 'NAME_TAKEN' },
      }),
      'resource',
    );
    expect(failure).toEqual({
      message: 'A resource named “Crane A” already exists.',
      library: 'resources',
    });
  });
});

describe('describeRestoreFailure — CALENDAR_WRONG_SCOPE (ADR-0200 D5)', () => {
  it('names the calendar and links to the calendars library, whatever the row', () => {
    const failure = describeRestoreFailure(
      conflict({
        reason: 'CALENDAR_WRONG_SCOPE',
        calendar: { id: 'c1', name: 'Site hours', deleteBatchId: null },
        projectId: 'p2',
      }),
      'plan',
    );
    expect(failure).toEqual({
      message:
        'It uses the calendar “Site hours”, which now belongs to another project. Make it an organisation calendar again, then restore this.',
      library: 'calendars',
    });
  });

  it('still points at the library when the server sent no name', () => {
    const failure = describeRestoreFailure(conflict({ reason: 'CALENDAR_WRONG_SCOPE' }), 'client');
    expect(failure.library).toBe('calendars');
    expect(failure.message).toContain('now belongs to another project');
  });
});
