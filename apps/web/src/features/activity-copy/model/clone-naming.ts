/**
 * Naming a copy (`docs/specs/activity-copy-paste/` M0-T2).
 *
 * **This is a correctness requirement, not a cosmetic one.** An activity's `name` is UNIQUE per
 * plan among live rows —
 * `apps/api/prisma/migrations/20260710092048_add_activities/migration.sql:78`,
 * `CREATE UNIQUE INDEX "uq_activities_plan_name" … WHERE "deleted_at" IS NULL` — and nothing in
 * `ActivitiesService.create` catches the violation, so a duplicate name surfaces as a Prisma
 * `P2002` mapped to a **409 with a deliberately noun-free message**
 * (`apps/api/src/common/filters/all-exceptions.filter.ts:111-115`). A paste that reused the source
 * name would therefore fail, and fail with a sentence naming nothing the planner could act on.
 *
 * **Why this is not `disambiguate` from `@repo/interchange`** (`packages/interchange/src/validate.ts:55-63`):
 * that function exists to make an *imported* file's own duplicates land at all, and its shape is
 * "append ` (2)`, ` (3)` … until free" over names the planner never chose. This one has to produce
 * a name a planner reads as *a copy of that* — ` (copy)`, ` (copy 2)` — and it has to survive being
 * run on its own output (copying a copy). Sharing one function would mean one of the two callers
 * getting a name that means the wrong thing. Recorded in `docs/DECISIONS.md` so the duplication is
 * not "fixed" later.
 */

/** The API's `@MaxLength(200)` on `CreateActivityDto.name` (`create-activity.dto.ts:46`). */
export const ACTIVITY_NAME_MAX_LENGTH = 200;

/** The suffix for the first copy; later copies are numbered from 2. */
const COPY_SUFFIX = ' (copy)';

/**
 * A free name for a copy of `sourceName`, given every name currently live in the plan.
 *
 * Sequence: `X (copy)`, `X (copy 2)`, `X (copy 3)`, … — the first that is not in `usedNames`.
 * **Gaps are filled**: with `X (copy)` and `X (copy 3)` taken, this returns `X (copy 2)`. That is
 * deliberate rather than incidental — a planner who deleted the second copy and makes another
 * expects the empty slot back, and a monotonically increasing counter would need state nothing here
 * holds.
 *
 * The base is truncated so the result is always ≤ {@link ACTIVITY_NAME_MAX_LENGTH}. Without that a
 * 200-character source name produces a 207-character copy name and a 422 at write time — which
 * reads as "duplicate is broken" rather than "that name is at the limit".
 */
export function freeCopyName(sourceName: string, usedNames: ReadonlySet<string>): string {
  for (let n = 1; ; n += 1) {
    const suffix = n === 1 ? COPY_SUFFIX : `${COPY_SUFFIX.slice(0, -1)} ${String(n)})`;
    // Truncate the BASE, never the suffix: a name ending in "(cop" tells the reader nothing, and
    // two different sources truncated to the same base would then collide on every attempt.
    const room = ACTIVITY_NAME_MAX_LENGTH - suffix.length;
    const base = sourceName.length > room ? sourceName.slice(0, room).trimEnd() : sourceName;
    const candidate = `${base}${suffix}`;
    if (!usedNames.has(candidate)) return candidate;
  }
}
