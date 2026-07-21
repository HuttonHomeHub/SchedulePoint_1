import { Module } from '@nestjs/common';

import { VersionController } from './version.controller';
import { VersionService } from './version.service';

/** Exposes the public `GET /api/v1/version` build-metadata endpoint. */
@Module({
  controllers: [VersionController],
  providers: [VersionService],
})
export class VersionModule {}
