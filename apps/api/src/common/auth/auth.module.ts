import { Global, Module } from '@nestjs/common';

import { AuthContextService } from './auth-context.service';

/**
 * Global module exposing the authentication seam ({@link AuthContextService}).
 * Global so the authentication guard can resolve the principal anywhere.
 */
@Global()
@Module({
  providers: [AuthContextService],
  exports: [AuthContextService],
})
export class AuthModule {}
