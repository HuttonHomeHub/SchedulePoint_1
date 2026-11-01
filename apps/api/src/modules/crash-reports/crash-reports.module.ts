import { Module } from '@nestjs/common';

import { CrashReportService } from './crash-report.service';
import { CrashReportsController } from './crash-reports.controller';

/**
 * The browser crash-report sink (browser crash reports M1-T2). Separate from `StaffModule` for the
 * reason `CspModule` is: the staff console only *reads* what this collects, and a writer reachable
 * by every signed-in user does not belong inside the module whose identity is a staff guard.
 */
@Module({
  controllers: [CrashReportsController],
  providers: [CrashReportService],
})
export class CrashReportsModule {}
