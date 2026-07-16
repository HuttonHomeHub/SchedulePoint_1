/**
 * A **single-resource** result that needs to carry `meta` alongside its `data` (see docs/API.md) —
 * the non-list counterpart to {@link Paginated}. Most handlers return a bare DTO (the interceptor
 * wraps it as `{ data }`); reach for this only when a successful single-resource response also needs
 * out-of-band metadata, e.g. the progress endpoint reporting the repairs it applied
 * (`meta.warnings`, M2/ADR-0035 §6). Using a class (not key-sniffing) lets the interceptor detect it
 * reliably.
 */
export class ResourceEnvelope<T, M extends object> {
  constructor(
    readonly data: T,
    readonly meta: M,
  ) {}
}
