import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/** Global module exposing the shared {@link PrismaService}. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
