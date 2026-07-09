import { Global, Module } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';

import { AuthContextService } from './auth-context.service';
import { AUTH_INSTANCE, createAuth } from './better-auth';

/**
 * Global module exposing the authentication seam: the configured Better Auth
 * instance ({@link AUTH_INSTANCE}) and the {@link AuthContextService} that
 * resolves the request {@link Principal}. Global so the authentication guard can
 * resolve the principal anywhere, and so `main.ts` can mount the auth handler.
 */
@Global()
@Module({
  providers: [
    {
      provide: AUTH_INSTANCE,
      inject: [PrismaService, AppConfigService],
      useFactory: (prisma: PrismaService, config: AppConfigService) =>
        createAuth(prisma, {
          secret: config.betterAuthSecret,
          baseURL: config.betterAuthUrl,
          trustedOrigins: config.corsOrigins,
          isProduction: config.isProduction,
        }),
    },
    AuthContextService,
  ],
  exports: [AUTH_INSTANCE, AuthContextService],
})
export class AuthModule {}
