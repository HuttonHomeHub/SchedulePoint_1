import { Global, Module } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

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
      inject: [PrismaService, AppConfigService, MailService, AuditService, PinoLogger],
      useFactory: (
        prisma: PrismaService,
        config: AppConfigService,
        mail: MailService,
        audit: AuditService,
        logger: PinoLogger,
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
          // Same seam, same reason (ADR-0074). The library never learns which transport is bound.
          sendPasswordReset: (input) => mail.sendPasswordReset(input),
          // `recordBestEffort`, not `record`: these fire outside any transaction, and refusing
          // every sign-in because the audit table is unavailable would turn a logging fault into
          // an outage. ADR-0072 names that gap rather than hiding it — auth rows are best-effort,
          // membership rows are not.
          recordAuthEvent: (event, evidence) => audit.recordBestEffort({ ...event, ...evidence }),
          // Attribute a failed sign-in to the account it named, so its own holder can read it
          // (ADR-0073 C2.2). A narrow read rather than the users service: this is the whole of
          // what the auth seam is allowed to ask for, and a service handle would let a later
          // edit reach anything.
          //
          // The catch is HERE rather than in the caller because this is where a logger exists.
          // The port is contracted never to reject — running on the sign-in path, a lookup fault
          // must not become a refused sign-in — and `attributeAttemptedAddress` guards it a second
          // time in case that contract is ever broken by an edit to this line.
          // The library's own log lines, into Pino (`docs/TECH_DEBT.md` #94, ADR-0074). Before
          // this they went to stdout as bare `[Better Auth]:` text — outside the structured
          // stream, outside correlation IDs, outside redaction — which is where a swallowed
          // mail-send failure went to die.
          log: (level, message, args) => {
            const context = args.length > 0 ? { betterAuth: args } : {};
            if (level === 'error') logger.error(context, message);
            else if (level === 'warn') logger.warn(context, message);
            else if (level === 'info') logger.info(context, message);
            else logger.debug(context, message);
          },
          findUserIdByEmail: async (email) => {
            try {
              const user = await prisma.user.findUnique({
                where: { email },
                select: { id: true },
              });
              return user?.id ?? null;
            } catch (error) {
              logger.error(
                { err: error },
                'failed sign-in could not be attributed; the row is recorded unattributed',
              );
              return null;
            }
          },
        }),
    },
    AuthContextService,
  ],
  exports: [AUTH_INSTANCE, AuthContextService],
})
export class AuthModule {}
