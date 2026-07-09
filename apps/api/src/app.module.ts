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
import { AppConfigService } from './config/app-config.service';
import { AppConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { MeModule } from './modules/me/me.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PrismaModule } from './prisma/prisma.module';

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
          ...(config.isProduction
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
    HealthModule,
    MeModule,
    OrganizationsModule,
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
