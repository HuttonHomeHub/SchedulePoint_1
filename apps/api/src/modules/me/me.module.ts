import { Module } from '@nestjs/common';

import { MeController } from './me.controller';
import { MeService } from './me.service';

/** Current-user module (`/api/v1/me`). */
@Module({
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
