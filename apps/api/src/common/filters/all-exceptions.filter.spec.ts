import { HttpStatus, NotFoundException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { ApiError } from '@repo/types';
import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ConflictError,
  ForbiddenError,
  GoneError,
  LockedError,
  NotFoundError,
  ValidationError,
} from '../errors/domain-errors';
import { tagBodyParserErrors } from '../http/body-parser-errors';

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

  beforeEach(() => {
    vi.mocked(filter['logger'].warn).mockClear();
    vi.mocked(filter['logger'].error).mockClear();
  });

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

  // The shapes body-parser@2.3.0 / raw-body@3.0.2 throw, by their own `type` tag (read from
  // `body-parser/lib/read.js` and `raw-body/index.js`). Each carries a message that echoes the
  // request — the parser's own text must never reach the client.
  it.each([
    ['entity.parse.failed', 400, 'BAD_REQUEST', 'Unexpected end of JSON input'],
    ['entity.verify.failed', 403, 'BAD_REQUEST', 'verify failed'],
    ['request.aborted', 400, 'BAD_REQUEST', 'request aborted'],
    ['request.size.invalid', 400, 'BAD_REQUEST', 'request size did not match content length'],
    ['charset.unsupported', 415, 'UNSUPPORTED_MEDIA_TYPE', 'unsupported charset "UTF-7"'],
    ['encoding.unsupported', 415, 'UNSUPPORTED_MEDIA_TYPE', 'unsupported content encoding "br"'],
  ])('maps the parser’s %s error (its status %i) to a client error', (type, status, code, text) => {
    const error = Object.assign(new Error(text), { type, status, statusCode: status });
    const { host, sent } = mockHost();
    filter.catch(error, host);
    expect(sent.status).toBe(code === 'BAD_REQUEST' ? 400 : 415);
    expect(sent.body?.error.code).toBe(code);
    expect(sent.body?.error.message).not.toContain(text);
    // A client's mistake is an expected outcome, not an incident.
    expect(filter['logger'].error).not.toHaveBeenCalled();
    expect(filter['logger'].warn).toHaveBeenCalled();
  });

  // What body-parser does to a raw-body/zlib failure: `createError(400, error)` with NO `type`
  // (`lib/read.js:125`, `:136`) — a gzip body of junk bytes is `Z_DATA_ERROR`. Only the fact that
  // OUR error handler received it from the parsers can tell it from any other error with a status.
  /** Pass an error through `tagBodyParserErrors` the way Express does after a parser fails. */
  function fromParser(error: Error): Error {
    let seen: unknown;
    tagBodyParserErrors(error, {} as Request, {} as Response, (e?: unknown) => {
      seen = e;
    });
    expect(seen).toBeInstanceOf(Error);
    return seen as Error;
  }

  // Nest's router error layer turns any `SyntaxError` into `new BadRequestException(err.message)`
  // before a filter sees it (`@nestjs/core` `router/routes-resolver.js:99-100`). body-parser's JSON
  // failure IS a `SyntaxError`, so the handler must hand on something that is not one, or the filter
  // receives an HttpException carrying "Unexpected end of JSON input" and echoes it.
  it('hands on a parser SyntaxError as a non-SyntaxError that keeps only its type and status', () => {
    const parse = Object.assign(new SyntaxError('Unexpected end of JSON input'), {
      type: 'entity.parse.failed',
      status: 400,
      body: '{"a":',
    });
    const forwarded = fromParser(parse);
    expect(forwarded).not.toBeInstanceOf(SyntaxError);
    expect(forwarded).toMatchObject({ type: 'entity.parse.failed', status: 400 });
    expect(forwarded.message).not.toContain('JSON input');
    expect(forwarded).not.toHaveProperty('body');
    const { host, sent } = mockHost();
    filter.catch(forwarded, host);
    expect(sent.status).toBe(HttpStatus.BAD_REQUEST);
    expect(sent.body?.error).toEqual({
      code: 'BAD_REQUEST',
      message: 'The request body could not be read.',
    });
  });

  it('maps a parser error with no type tag and status 400 to 400 when the parser handed it over', () => {
    const corrupt = fromParser(
      Object.assign(new Error('incorrect header check'), {
        status: 400,
        statusCode: 400,
        code: 'Z_DATA_ERROR',
      }),
    );
    const { host, sent } = mockHost();
    filter.catch(corrupt, host);
    expect(sent.status).toBe(HttpStatus.BAD_REQUEST);
    expect(sent.body?.error).toEqual({
      code: 'BAD_REQUEST',
      message: 'The request body could not be read.',
    });
    expect(filter['logger'].error).not.toHaveBeenCalled();
  });

  it('does not map the same error when nothing marked it as coming from a parser', () => {
    const { host, sent } = mockHost();
    filter.catch(
      Object.assign(new Error('incorrect header check'), { status: 400, code: 'Z_DATA_ERROR' }),
      host,
    );
    expect(sent.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it.each([
    ['a server-side stream fault', 'stream.not.readable', 500],
    ['an untyped error with an unexpected status', undefined, 403],
  ])('keeps %s from the parser a 500', (_name, type, status) => {
    const { host, sent } = mockHost();
    filter.catch(
      fromParser(Object.assign(new Error('stream is not readable'), { type, status })),
      host,
    );
    expect(sent.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(sent.body?.error.code).toBe('INTERNAL_ERROR');
  });

  it('does not map a parser tag that is not on the allow-list (a server-side stream fault)', () => {
    const { host, sent } = mockHost();
    filter.catch(
      Object.assign(new Error('stream is not readable'), {
        type: 'stream.not.readable',
        status: 500,
      }),
      host,
    );
    expect(sent.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(sent.body?.error.code).toBe('INTERNAL_ERROR');
  });

  it('does not trust a bare `status` property on an unknown error', () => {
    const { host, sent } = mockHost();
    filter.catch(Object.assign(new Error('boom'), { status: 413 }), host);
    expect(sent.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(sent.body?.error.code).toBe('INTERNAL_ERROR');
  });
});

describe('AllExceptionsFilter — Nest’s default 404 does not echo the request (#459)', () => {
  const filter = new AllExceptionsFilter();
  vi.spyOn(filter['logger'], 'warn').mockImplementation(() => undefined);

  it.each([
    ['GET', '/api/v1/x'],
    ['POST', '/api/v1/staff/me'],
    ['GET', '/api/v1/staff/no-such-route?secret=1'],
  ])('answers an unmapped %s %s with "Not found" and no path', (method, path) => {
    // The exact exception Nest's router throws for an unmatched route
    // (`@nestjs/core` `router/routes-resolver.js`), so this is the shape the guard-less path sees.
    const { host, sent } = mockHost();
    filter.catch(new NotFoundException(`Cannot ${method} ${path}`), host);
    expect(sent.status).toBe(HttpStatus.NOT_FOUND);
    expect(sent.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } });
    expect(JSON.stringify(sent.body)).not.toContain('/api');
  });

  it('keeps a 404 message somebody wrote on purpose', () => {
    const { host, sent } = mockHost();
    filter.catch(new NotFoundException('That share link has expired.'), host);
    expect(sent.body?.error.message).toBe('That share link has expired.');
  });

  it('leaves a non-404 whose text looks like Nest’s default alone', () => {
    const { host, sent } = mockHost();
    filter.catch(new ForbiddenError('Cannot GET /api/v1/x'), host);
    expect(sent.body?.error.message).toBe('Cannot GET /api/v1/x');
  });
});
