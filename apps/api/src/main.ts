import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

import { configureHttpApp } from './app-setup';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';

/**
 * API bootstrap. Wires the security, versioning, logging, auth, and OpenAPI
 * concerns described in docs/BACKEND_ARCHITECTURE.md, then starts the HTTP
 * server.
 *
 * `bodyParser: false` — body parsing is added by `configureHttpApp` AFTER the
 * Better Auth handler is mounted, so that handler receives the raw request body.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  const config = app.get(AppConfigService);

  // Route framework logs through Pino (structured + correlated).
  app.useLogger(app.get(Logger));
  app.flushLogs();

  // Security headers, CORS, Better Auth handler, body parsers, prefix, versioning.
  configureHttpApp(app);

  // Drain in-flight work on SIGTERM/SIGINT.
  app.enableShutdownHooks();

  // OpenAPI — served outside production only.
  if (!config.isProduction) {
    const openapi = new DocumentBuilder()
      .setTitle('SchedulePoint API')
      .setDescription('SchedulePoint REST API')
      .setVersion('1.0')
      .addCookieAuth('schedulepoint.session_token')
      .build();
    const document = SwaggerModule.createDocument(app, openapi);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(config.port);
}

void bootstrap();
