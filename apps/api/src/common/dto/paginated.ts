import type { PageMeta } from '@repo/types';

/**
 * A page of results returned by a service. The response interceptor renders it
 * as the `{ data, meta }` envelope (see docs/API.md). Using a class (rather than
 * key-sniffing) lets the interceptor detect pagination reliably.
 */
export class Paginated<T> {
  constructor(
    readonly data: T[],
    readonly meta: PageMeta,
  ) {}
}
