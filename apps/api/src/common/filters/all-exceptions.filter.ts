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
  NotFoundError,
  ValidationError,
} from '../errors/domain-errors';

interface Mapped {
  status: number;
  code: string;
  message: string;
  details?: unknown;
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
    if (error instanceof ValidationError) return HttpStatus.UNPROCESSABLE_ENTITY;
    return HttpStatus.BAD_REQUEST;
  }

  private mapPrisma(error: Prisma.PrismaClientKnownRequestError): Mapped {
    switch (error.code) {
      case 'P2025':
        return { status: HttpStatus.NOT_FOUND, code: 'NOT_FOUND', message: 'Resource not found.' };
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          code: 'CONFLICT',
          message: 'A resource with these details already exists.',
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
    const status = exception.getStatus();
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
    return { status, code: this.statusCode(status), message, details };
  }

  private statusCode(status: number): string {
    const codes: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
      [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
      [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
      [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
      [HttpStatus.CONFLICT]: 'CONFLICT',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_FAILED',
      [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
    };
    return codes[status] ?? 'ERROR';
  }
}
