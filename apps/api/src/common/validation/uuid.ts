/**
 * Version-agnostic UUID matcher for DTO fields (`@Matches`). Our IDs are UUID v7 (time-ordered),
 * and class-validator's `@IsUUID` pins a version, so DTOs validate the canonical shape directly.
 *
 * Path parameters use Nest's bare `ParseUUIDPipe`, whose default `all` pattern is the same shape
 * (`parse-uuid.pipe.js:37-52`; `docs/TECH_DEBT.md` #340 recorded the swap).
 */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
