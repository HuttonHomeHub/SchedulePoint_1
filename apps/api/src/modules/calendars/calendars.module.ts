import { Module, forwardRef } from '@nestjs/common';

import { OrganizationsModule } from '../organizations/organizations.module';
import { ProjectsModule } from '../projects/projects.module';
import { ResourcesModule } from '../resources/resources.module';

import { CalendarRepository } from './calendar.repository';
import { CalendarsController } from './calendars.controller';
import { CalendarsService } from './calendars.service';
import { ProjectCalendarsController } from './project-calendars.controller';

/**
 * Calendars module — the org-scoped working-day calendar library (ADR-0024).
 * Reuses OrganizationsService (org-scope resolver). Calendars are a sibling
 * library rather than a hierarchy level, so this module owns its own soft-delete
 * cascade (calendar → exceptions) and does not depend on HierarchyModule. Exports
 * the repository so the plans + schedule modules (Tasks C1/C2) can reference and
 * load a plan's calendar.
 *
 * Imports ResourcesModule (via `forwardRef`, since ResourcesModule needs
 * CalendarRepository) so CalendarsService can extend the CALENDAR_IN_USE guard to
 * count active resources referencing a calendar (a third referencer, ADR-0039 (c)) —
 * and, since ADR-0053, so the narrowing guard can count them too.
 *
 * Imports ProjectsModule for its ProjectRepository: a PROJECT-scoped calendar's owning
 * project must be verified active + in-org on create and on narrow (the FK does NOT
 * enforce same-org). ProjectsModule depends only on organizations/hierarchy/clients, so
 * this is a plain (non-circular) import.
 *
 * Exports the guard-bearing CalendarRepository; the shared `assertCalendarUsableBy`
 * (ADR-0053 §2) is a free function over that repository, so every seam module that
 * already imports this one gets the invariant with no extra provider.
 */
@Module({
  imports: [OrganizationsModule, ProjectsModule, forwardRef(() => ResourcesModule)],
  controllers: [CalendarsController, ProjectCalendarsController],
  providers: [CalendarsService, CalendarRepository],
  exports: [CalendarRepository],
})
export class CalendarsModule {}
