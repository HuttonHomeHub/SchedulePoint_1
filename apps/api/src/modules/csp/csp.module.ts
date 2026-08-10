import { Module } from '@nestjs/common';

import { CspReportController } from './csp-report.controller';
import { CspReportService } from './csp-report.service';

/**
 * The CSP violation sink (staff console M4). Separate from `StaffModule` on purpose: this route is
 * `@Public()` and anonymous, and the staff console only *reads* what it collects — putting an
 * unauthenticated writer inside the module whose whole identity is a guard would be the first step
 * towards somebody assuming the guard covers it.
 */
@Module({
  controllers: [CspReportController],
  providers: [CspReportService],
  exports: [CspReportService],
})
export class CspModule {}
