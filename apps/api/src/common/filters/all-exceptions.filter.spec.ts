import { HttpStatus } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { ApiError } from '@repo/types';
import { describe, expect, it, vi } from 'vitest';

import {
  ConflictError,
  ForbiddenError,
  GoneError,
  LockedError,
  NotFoundError,
  ValidationError,
} from '../errors/domain-errors';

import { AllExceptionsFilter } from './all-exceptions.filter';

/** Build a minimal ArgumentsHost whose response captures the status + JSON body. */
function mockHost(): {
  host: ArgumentsHost;
  sent: { status?: number; body?: ApiError };
} {
  const sent: { status?: number; body?: ApiError } = {};
  const response = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    json(body: ApiError) {
      sent.body = body;
      return this;
    },
  };
  const request = { id: 'corr-1', url: '/x', method: 'POST' };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, sent };
}

describe('AllExceptionsFilter — domain error → status/code mapping', () => {
  const filter = new AllExceptionsFilter();
  // Silence the incident logger for the duration of the suite.
  vi.spyOn(filter['logger'], 'warn').mockImplementation(() => undefined);
  vi.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);

  it.each([
    [new NotFoundError('nope'), HttpStatus.NOT_FOUND, 'NOT_FOUND'],
    [new ConflictError('clash'), HttpStatus.CONFLICT, 'CONFLICT'],
    [new ForbiddenError('no'), HttpStatus.FORBIDDEN, 'FORBIDDEN'],
    [new GoneError('gone'), HttpStatus.GONE, 'GONE'],
    [new ValidationError('bad'), HttpStatus.UNPROCESSABLE_ENTITY, 'VALIDATION_FAILED'],
    [new LockedError('locked'), HttpStatus.LOCKED, 'LOCKED'],
  ])('maps %s → %i', (error, status, code) => {
    const { host, sent } = mockHost();
    filter.catch(error, host);
    expect(sent.status).toBe(status);
    expect(sent.body?.error.code).toBe(code);
  });

  it('maps LockedError to 423 and carries its reason details', () => {
    const { host, sent } = mockHost();
    filter.catch(
      new LockedError('You are not the editor.', { reason: 'PLAN_EDIT_LOCK_REQUIRED' }),
      host,
    );
    expect(sent.status).toBe(423);
    expect(sent.body?.error).toMatchObject({
      code: 'LOCKED',
      message: 'You are not the editor.',
      details: { reason: 'PLAN_EDIT_LOCK_REQUIRED' },
    });
  });
});
