/**
 * Version-agnostic UUID matcher for DTO fields (`@Matches`). Our IDs are UUID v7 (time-ordered),
 * and class-validator's `@IsUUID` pins a version, so DTOs validate the canonical shape directly.
 *
 * Path parameters use Nest's bare `ParseUUIDPipe`. Its default `all` pattern is narrower than this one
 * since `@nestjs/common` 12: versions 1-8 with the RFC variant, plus Nil and Max
 * (`pipes/parse-uuid.pipe.js`, lines 27-55). That is harmless here because every id is generated as
 * Prisma `uuid(7)` (version 7) or `randomUUID()` / `gen_random_uuid()` (version 4), all RFC variant.
 * `docs/TECH_DEBT.md` #340 recorded the swap.
 */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
