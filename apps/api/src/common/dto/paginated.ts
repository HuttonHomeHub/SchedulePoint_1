import type { PageMeta } from '@repo/types';

/**
 * A list result rendered as the `{ data, meta }` envelope (see docs/API.md). Using
 * a class (rather than key-sniffing) lets the interceptor detect it reliably. The
 * meta defaults to cursor {@link PageMeta}, but a bounded (unpaginated) list may
 * carry a different roll-up shape — e.g. the plan variance summary (ADR-0025).
 */
export class Paginated<T, M extends object = PageMeta> {
  constructor(
    readonly data: T[],
    readonly meta: M,
  ) {}
}
