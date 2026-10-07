import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ApiError } from '@repo/types';
import type { Request, Response } from 'express';

import {
  ConflictError,
  DomainError,
  ForbiddenError,
  GoneError,
  LockedError,
  NotFoundError,
  ValidationError,
} from '../errors/domain-errors';
import { isBodyParserError } from '../http/body-parser-errors';

interface Mapped {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

/**
 * The text Nest's own router gives a request no handler matched — `Cannot GET /api/v1/x`
 * (`@nestjs/core` `router/routes-resolver.js`, `registerNotFoundHandler`). It echoes the method and the
 * full path and query, which is the one thing that tells an unmapped route from a guarded one that
 * answers `Not found` (`StaffGuard`, ADR-0086), and an error body is not meant to echo the request
 * (the filter's own rule above). Matched on its shape rather than on every 404, so a message somebody
 * wrote on purpose survives.
 */
const NEST_DEFAULT_NOT_FOUND = /^Cannot [A-Z]+ \//;
const NOT_FOUND_MESSAGE = 'Not found';

// Fixed texts: the parser's own message echoes the request (byte counts, the charset it named, the
// JSON parse position), so none of it is passed on.
const BAD_BODY: Mapped = {
  status: HttpStatus.BAD_REQUEST,
  code: 'BAD_REQUEST',
  message: 'The request body could not be read.',
};
const UNSUPPORTED_BODY: Mapped = {
  status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
  code: 'UNSUPPORTED_MEDIA_TYPE',
  message: 'The request body uses a charset or content encoding that is not supported.',
};
const BODY_TOO_LARGE: Mapped = {
  status: HttpStatus.PAYLOAD_TOO_LARGE,
  code: 'PAYLOAD_TOO_LARGE',
  message: 'The request body is too large.',
};

/**
 * The client errors `body-parser` and its `raw-body` reader throw, keyed on their own `type` tag
 * (`body-parser/lib/read.js`, `raw-body/index.js`). An allow-list on purpose: the server-side tags
 * (`stream.not.readable`, `stream.encoding.set`) stay opaque 500s. `entity.verify.failed` is a 403
 * in body-parser, but no `verify` hook is mounted and a 403 here would read as an authorisation
 * failure, so it is a plain bad body.
 */
const BODY_PARSER_ERRORS: ReadonlyMap<string, Mapped> = new Map([
  ['entity.too.large', BODY_TOO_LARGE],
  ['entity.parse.failed', BAD_BODY],
  ['entity.verify.failed', BAD_BODY],
  ['request.aborted', BAD_BODY],
  ['request.size.invalid', BAD_BODY],
  ['charset.unsupported', UNSUPPORTED_BODY],
  ['encoding.unsupported', UNSUPPORTED_BODY],
]);

function mapBodyParserError(exception: unknown): Mapped | undefined {
  if (typeof exception !== 'object' || exception === null) return undefined;
  const { type, status } = exception as { type?: unknown; status?: unknown };
  const known = typeof type === 'string' ? BODY_PARSER_ERRORS.get(type) : undefined;
  if (known) return known;
  // body-parser wraps a raw-body/zlib failure (a corrupt gzip body) as a bare 400 with no `type`.
  // The status is only believed because our own error handler received it after the parsers
  // (`isBodyParserError`) — never on the status alone. Any other status stays a 500.
  return isBodyParserError(exception) && status === HttpStatus.BAD_REQUEST ? BAD_BODY : undefined;
}

/**
 * Global exception filter: maps every error — domain errors, HTTP exceptions,
 * Prisma errors, and unexpected failures — to the standard {@link ApiError}
 * envelope. Internal details and stack traces never reach the client. 5xx are
 * logged as incidents with the correlation id; 4xx are expected outcomes.
 * See docs/BACKEND_ARCHITECTURE.md (Error handling).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();

    const mapped = this.mapException(exception);

    const body: ApiError = {
      error: {
        code: mapped.code,
        message: mapped.message,
        ...(mapped.details === undefined ? {} : { details: mapped.details }),
      },
    };

    if (mapped.status >= 500) {
      this.logger.error(
        { correlationId: request.id, err: exception, path: request.url },
        `Unhandled ${mapped.status} on ${request.method} ${request.url}`,
      );
    } else {
      this.logger.warn(
        { correlationId: request.id, code: mapped.code, path: request.url },
        `${mapped.status} ${mapped.code} on ${request.method} ${request.url}`,
      );
    }

    response.status(mapped.status).json(body);
  }

  private mapException(exception: unknown): Mapped {
    if (exception instanceof DomainError) {
      return {
        status: this.domainStatus(exception),
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.mapPrisma(exception);
    }

    if (exception instanceof HttpException) {
      return this.mapHttp(exception);
    }

    // The body parsers run before Nest's router and throw plain http-errors objects, which are none
    // of the above — so a bad or over-cap body used to read as a server fault (and was logged as an
    // incident). Recognised by the parser's own `type` tag only: a bare `status` on an unknown error
    // is not evidence of anything.
    const bodyError = mapBodyParserError(exception);
    if (bodyError) return { ...bodyError };

    // Unknown/unexpected → opaque 500 (never leak internals).
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    };
  }

  private domainStatus(error: DomainError): number {
    if (error instanceof NotFoundError) return HttpStatus.NOT_FOUND;
    if (error instanceof ConflictError) return HttpStatus.CONFLICT;
    if (error instanceof ForbiddenError) return HttpStatus.FORBIDDEN;
    if (error instanceof GoneError) return HttpStatus.GONE;
    if (error instanceof LockedError) return HttpStatus.LOCKED;
    if (error instanceof ValidationError) return HttpStatus.UNPROCESSABLE_ENTITY;
    return HttpStatus.BAD_REQUEST;
  }

  private mapPrisma(error: Prisma.PrismaClientKnownRequestError): Mapped {
    switch (error.code) {
      case 'P2025':
        return { status: HttpStatus.NOT_FOUND, code: 'NOT_FOUND', message: 'Resource not found.' };
      case 'P2002':
        // Deliberately does NOT say "resource". It used to, meaning a REST resource — but this is a
        // scheduling product with a resource LIBRARY, so an import that collided on an activity name
        // told its reader a resource already existed, and sent them to a resource panel that was
        // empty (TECH_DEBT #87). A generic message must not borrow a domain noun.
        return {
          status: HttpStatus.CONFLICT,
          code: 'CONFLICT',
          message: 'That would duplicate an existing record. Check any name or code you have used.',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred.',
        };
    }
  }

  private mapHttp(exception: HttpException): Mapped {
    const status: HttpStatus = exception.getStatus();
    const res = exception.getResponse();
    // Nest's ValidationPipe returns { message: string[], error, statusCode }.
    let message = exception.message;
    let details: unknown;
    if (typeof res === 'object' && res !== null) {
      const record = res as Record<string, unknown>;
      if (Array.isArray(record.message)) {
        message = 'Validation failed.';
        details = record.message;
      } else if (typeof record.message === 'string') {
        message = record.message;
      }
    }
    if (status === HttpStatus.NOT_FOUND && NEST_DEFAULT_NOT_FOUND.test(message)) {
      message = NOT_FOUND_MESSAGE;
    }
    return { status, code: this.statusCode(status), message, details };
  }

  private statusCode(status: number): string {
    const codes: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
      [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
      [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
      [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
      [HttpStatus.CONFLICT]: 'CONFLICT',
      [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
      [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'UNSUPPORTED_MEDIA_TYPE',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_FAILED',
      [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
    };
    return codes[status] ?? 'ERROR';
  }
}
