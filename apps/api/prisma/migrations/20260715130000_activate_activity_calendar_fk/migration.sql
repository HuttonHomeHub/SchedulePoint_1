-- Activate the reserved activities.calendar_id column as a real, client-settable FK
-- (M5, ADR-0037 §7). No data migration: the column is already nullable = inherit the
-- plan default (resolution activity.calendarId → plan.calendarId → all-minutes), so
-- this is purely additive — the FK + a partial index. Mirrors the plan-calendar
-- precedent (…_add_plan_calendar) exactly so plans and activities behave identically.

-- AddForeignKey (ON DELETE RESTRICT — as Plan.calendar). Calendars soft-delete only,
-- so this referential check never actually fires; the CALENDAR_IN_USE service guard
-- (which now unions active plans + active activities, T5) is the real protection and
-- RESTRICT is defence in depth. The FK does NOT enforce same-org — a cross-org
-- calendar_id satisfies it — so the org-scope check stays in the service (like the
-- plan picker).
ALTER TABLE "activities" ADD CONSTRAINT "activities_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "calendars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Partial index (Prisma cannot express `WHERE ...`). Serves the delete-in-use guard,
-- which counts ACTIVE activities referencing a calendar (`WHERE calendar_id = ? AND
-- deleted_at IS NULL`) before allowing a calendar delete. Restricted to rows that
-- actually reference a calendar so it stays small. (It does not back the FK RESTRICT
-- referential check, which scans all referencing rows — but calendars are soft-deleted
-- only, so that check never fires; the service guard is the real one.) Named to mirror
-- idx_plans_calendar_id; well under the 63-char identifier limit.
CREATE INDEX "idx_activities_calendar_id" ON "activities" ("calendar_id") WHERE "deleted_at" IS NULL AND "calendar_id" IS NOT NULL;
