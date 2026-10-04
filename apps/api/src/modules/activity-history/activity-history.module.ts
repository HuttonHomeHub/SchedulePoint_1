import { Module } from '@nestjs/common';

import { OrganizationsModule } from '../organizations/organizations.module';

import { ActivityHistoryController } from './activity-history.controller';
import { ActivityHistoryRecorder } from './activity-history.recorder';
import { ActivityHistoryService } from './activity-history.service';

/**
 * Per-activity change history (ADR-0174). Exports the recorder the write paths call inside their own
 * transactions; the read route is served from here. Imports nothing from the activities, dependencies
 * or resources modules, which import this one — the read scopes the activity through Prisma directly,
 * as the assignment service does, to keep the module graph acyclic.
 */
@Module({
  imports: [OrganizationsModule],
  controllers: [ActivityHistoryController],
  providers: [ActivityHistoryRecorder, ActivityHistoryService],
  exports: [ActivityHistoryRecorder],
})
export class ActivityHistoryModule {}
