import { Module } from '@nestjs/common';

import { VersionController } from './version.controller';
import { VersionService } from './version.service';

/** Exposes the public `GET /api/v1/version` build-metadata endpoint. */
@Module({
  controllers: [VersionController],
  providers: [VersionService],
  // The organisation export stamps the API version into its manifest (ADR-0194).
  exports: [VersionService],
})
export class VersionModule {}
