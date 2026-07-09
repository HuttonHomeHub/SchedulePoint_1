import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { ApiResponse } from '@repo/types';
import { map, type Observable } from 'rxjs';

import { Paginated } from '../dto/paginated';

/**
 * Wraps every successful response in the standard `{ data, meta? }` envelope
 * (see docs/API.md). Handlers return resources/DTOs (wrapped as `data`) or a
 * {@link Paginated} result (rendered as `data` + `meta`). Errors are handled by
 * the exception filter, not here.
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
          return { data: value.data, meta: { ...value.meta } };
        }
        return { data: value };
      }),
    );
  }
}
