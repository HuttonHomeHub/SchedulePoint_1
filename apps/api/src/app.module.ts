import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { AuthModule } from './common/auth/auth.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AuthenticationGuard } from './common/guards/authentication.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { MailModule } from './common/mail/mail.module';
import { AppConfigService } from './config/app-config.service';
import { AppConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { ActivitiesModule } from './modules/activities/activities.module';
import { BaselinesModule } from './modules/baselines/baselines.module';
import { CalendarsModule } from './modules/calendars/calendars.module';
import { ClientsModule } from './modules/clients/clients.module';
import { CrossPlanDependenciesModule } from './modules/cross-plan-dependencies/cross-plan-dependencies.module';
import { DependenciesModule } from './modules/dependencies/dependencies.module';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { MeModule } from './modules/me/me.module';
import { MembersModule } from './modules/members/members.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PlanLockModule } from './modules/plan-lock/plan-lock.module';
import { PlansModule } from './modules/plans/plans.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { RecycleBinModule } from './modules/recycle-bin/recycle-bin.module';
import { ResourcesModule } from './modules/resources/resources.module';
import { ScheduleModule } from './modules/schedule/schedule.module';
import { PrismaModule } from './prisma/prisma.module';

/** Whether the optional `pino-pretty` dev logger transport can be loaded. */
function isPrettyLoggingAvailable(): boolean {
  try {
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

/**
 * Root module. Wires global cross-cutting concerns once — structured logging
 * with correlation IDs, rate limiting, validation, the error filter, the
 * response envelope, and deny-by-default auth/permission guards — so every
 * feature module inherits them. See docs/BACKEND_ARCHITECTURE.md.
 */
@Module({
  imports: [
    AppConfigModule,
    // Structured logging (Pino) + per-request correlation id.
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.logLevel,
          genReqId: (req: IncomingMessage, res: ServerResponse): string => {
            const header = req.headers['x-correlation-id'];
            const id = (typeof header === 'string' && header) || randomUUID();
            res.setHeader('x-correlation-id', id);
            return id;
          },
          // Never log secrets/PII.
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
              'req.body.password',
              'req.body.token',
              'req.body.secret',
            ],
            remove: true,
          },
          // Pretty logs only outside production, and only if pino-pretty is
          // actually installed — the production image excludes devDependencies,
          // so it must fall back to JSON logging rather than crash on a missing
          // transport when run in development mode.
          ...(config.isProduction || !isPrettyLoggingAvailable()
            ? {}
            : { transport: { target: 'pino-pretty', options: { singleLine: true } } }),
        },
      }),
    }),
    // Rate limiting (deny abusive traffic).
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        throttlers: [{ ttl: config.rateLimit.ttlMs, limit: config.rateLimit.limit }],
      }),
    }),
    PrismaModule,
    AuthModule,
    MailModule,
    HealthModule,
    MeModule,
    OrganizationsModule,
    MembersModule,
    InvitationsModule,
    ClientsModule,
    ProjectsModule,
    PlansModule,
    ActivitiesModule,
    DependenciesModule,
    CrossPlanDependenciesModule,
    ScheduleModule,
    CalendarsModule,
    ResourcesModule,
    BaselinesModule,
    PlanLockModule,
    RecycleBinModule,
  ],
  providers: [
    // Global validation: reject unknown fields, coerce types, 422 on failure.
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        errorHttpStatusCode: 422,
      }),
    },
    // Standard response envelope and error envelope.
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Guards run in order: rate limit → authenticate → authorise (deny by default).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
