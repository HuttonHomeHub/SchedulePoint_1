import { Module, forwardRef } from '@nestjs/common';

import { OrganizationsModule } from '../organizations/organizations.module';
import { ResourcesModule } from '../resources/resources.module';

import { CalendarRepository } from './calendar.repository';
import { CalendarsController } from './calendars.controller';
import { CalendarsService } from './calendars.service';

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
 * count active resources referencing a calendar (a third referencer, ADR-0039 (c)).
 */
@Module({
  imports: [OrganizationsModule, forwardRef(() => ResourcesModule)],
  controllers: [CalendarsController],
  providers: [CalendarsService, CalendarRepository],
  exports: [CalendarRepository],
})
export class CalendarsModule {}
