/**
 * Normalise a repeatable query parameter: it arrives as a string when sent once and as an array
 * when sent more than once, and `@IsIn(..., { each: true })` needs an array either way.
 *
 * **It lives in `common/` rather than beside its first caller**, and the move is the point. It was
 * written in `modules/audit/dto/list-audit-events-query.dto.ts` and exported so that module's own
 * subclasses could reuse it (ADR-0065's "two implementations drift, and the drift is invisible",
 * applied to a helper small enough that copying it looks harmless). The organisation overview then
 * needed the same three lines, and importing them from `modules/audit` would have made one feature
 * module's DTO file a dependency of another's — a boundary this codebase does not otherwise cross
 * (`docs/BACKEND_ARCHITECTURE.md`, module boundaries). Copying it would have been the drift the
 * original export existed to prevent, so it moved instead.
 */
export function toArray(value: unknown): unknown {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value : [value];
}
