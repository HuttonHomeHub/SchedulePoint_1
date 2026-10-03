import { Module } from '@nestjs/common';

import { ActivityHistoryRecorder } from './activity-history.recorder';

/**
 * Per-activity change history (ADR-0174). Exports the recorder the write paths call inside their own
 * transactions; the read route joins this module with its controller.
 */
@Module({
  providers: [ActivityHistoryRecorder],
  exports: [ActivityHistoryRecorder],
})
export class ActivityHistoryModule {}
