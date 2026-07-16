import {
  Injectable,
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
 * {@link ResourceEnvelope} when a non-list response also carries `meta`. Errors
 * are handled by the exception filter, not here.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<unknown> | undefined
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<unknown> | undefined> {
    return next.handle().pipe(
      map((value): ApiResponse<unknown> | undefined => {
        // 204 / empty responses (e.g. DELETE) are passed through unwrapped.
        if (value === undefined || value === null) {
          return undefined;
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
