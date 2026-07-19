import { Module } from '@nestjs/common';

import { ActivitiesModule } from '../activities/activities.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PlansModule } from '../plans/plans.module';

import { ActivityNotesController } from './activity-notes.controller';
import { NoteRepository } from './note.repository';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';
import { PlanNotesController } from './plan-notes.controller';

/**
 * Notes module (ADR-0046) — attributed, time-ordered threads on plans and activities. Reuses
 * OrganizationsService (org-scope resolver), PlansModule's PlanRepository and ActivitiesModule's
 * ActivityRepository (to load + org-scope the parent). Soft-delete of a directly-deleted note is
 * OWNED locally by NoteRepository (a fresh batch id); a parent-driven cascade/restore is owned by
 * the shared HierarchyLifecycleService (wired in M1). Deliberately NOT importing PlanLockModule:
 * note writes are non-structural and NOT pen-gated (ADR-0028/0046, the progress precedent).
 */
@Module({
  imports: [OrganizationsModule, PlansModule, ActivitiesModule],
  controllers: [PlanNotesController, ActivityNotesController, NotesController],
  providers: [NotesService, NoteRepository],
  exports: [NoteRepository],
})
export class NotesModule {}
