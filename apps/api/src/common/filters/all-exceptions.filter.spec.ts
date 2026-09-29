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

describe('AllExceptionsFilter — body-parser payload errors', () => {
  const filter = new AllExceptionsFilter();
  vi.spyOn(filter['logger'], 'warn').mockImplementation(() => undefined);
  vi.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);

  it('maps the JSON parser’s entity.too.large error to 413 with the envelope', () => {
    // The shape `body-parser` throws (an http-errors object): neither a DomainError nor an
    // HttpException, so it used to fall through to the opaque 500.
    const tooLarge = Object.assign(new Error('request entity too large'), {
      type: 'entity.too.large',
      status: 413,
      statusCode: 413,
      limit: 65_536,
      length: 100_000,
    });
    const { host, sent } = mockHost();
    filter.catch(tooLarge, host);
    expect(sent.status).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(sent.body?.error).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
    expect(sent.body?.error.message).not.toContain('entity');
  });

  it('does not trust a bare `status` property on an unknown error', () => {
    const { host, sent } = mockHost();
    filter.catch(Object.assign(new Error('boom'), { status: 413 }), host);
    expect(sent.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(sent.body?.error.code).toBe('INTERNAL_ERROR');
  });
});
