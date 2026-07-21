import {
  Injectable,
  StreamableFile,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { ApiResponse } from '@repo/types';
import { map, type Observable } from 'rxjs';

import { Paginated } from '../dto/paginated';
import { ResourceEnvelope } from '../dto/resource-envelope';

/**
 * Wraps every successful response in the standard `{ data, meta? }` envelope
 * (see docs/API.md). Handlers return resources/DTOs (wrapped as `data`), a
 * {@link Paginated} list (rendered as `data` + `meta`), or a single-resource
 * {@link ResourceEnvelope} when a non-list response also carries `meta`. A
 * binary {@link StreamableFile} response (e.g. schedule-interchange export,
 * ADR-0050) is passed through untouched — a file download is never a JSON
 * envelope. Errors are handled by the exception filter, not here.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<unknown> | StreamableFile | undefined
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<unknown> | StreamableFile | undefined> {
    return next.handle().pipe(
      map((value): ApiResponse<unknown> | StreamableFile | undefined => {
        // 204 / empty responses (e.g. DELETE) are passed through unwrapped.
        if (value === undefined || value === null) {
          return undefined;
        }
        // A binary file download (Nest streams it to the response) is returned as-is, never wrapped.
        if (value instanceof StreamableFile) {
          return value;
        }
        if (value instanceof Paginated) {
          // `instanceof` narrows the generic meta to `any`; it is always an object
          // (PageMeta or a bounded-list roll-up), rendered verbatim into the envelope.
          const meta = value.meta as Record<string, unknown>;
          return { data: value.data as unknown, meta: { ...meta } };
        }
        if (value instanceof ResourceEnvelope) {
          const meta = value.meta as Record<string, unknown>;
          return { data: value.data as unknown, meta: { ...meta } };
        }
        return { data: value };
      }),
    );
  }
}
