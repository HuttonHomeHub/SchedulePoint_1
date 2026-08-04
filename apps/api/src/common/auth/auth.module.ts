import { Global, Module } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';
import { AuditService } from '../../modules/audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

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
      inject: [PrismaService, AppConfigService, MailService, AuditService],
      useFactory: (
        prisma: PrismaService,
        config: AppConfigService,
        mail: MailService,
        audit: AuditService,
      ) =>
        createAuth(prisma, {
          secret: config.betterAuthSecret,
          baseURL: config.betterAuthUrl,
          trustedOrigins: config.corsOrigins,
          trustedProxies: config.trustedProxyIps,
          isProduction: config.isProduction,
          requireEmailVerification: config.requireEmailVerification,
          // The auth library reaches mail through the port, never a transport — so which adapter
          // is bound stays `MailModule`'s decision and this wiring is the same in every environment.
          sendVerificationEmail: (input) => mail.sendEmailVerification(input),
          // `recordBestEffort`, not `record`: these fire outside any transaction, and refusing
          // every sign-in because the audit table is unavailable would turn a logging fault into
          // an outage. ADR-0072 names that gap rather than hiding it — auth rows are best-effort,
          // membership rows are not.
          recordAuthEvent: (event, evidence) => audit.recordBestEffort({ ...event, ...evidence }),
        }),
    },
    AuthContextService,
  ],
  exports: [AUTH_INSTANCE, AuthContextService],
})
export class AuthModule {}
