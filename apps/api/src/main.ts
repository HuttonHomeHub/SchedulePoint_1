import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';

/**
 * API bootstrap. Wires the security, versioning, logging, and OpenAPI concerns
 * described in docs/BACKEND_ARCHITECTURE.md, then starts the HTTP server.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(AppConfigService);

  // Route framework logs through Pino (structured + correlated).
  app.useLogger(app.get(Logger));
  app.flushLogs();

  // Security headers.
  app.use(helmet());

  // CORS — credentials on, explicit allow-list (cookie-based auth).
  app.enableCors({ origin: config.corsOrigins, credentials: true });

  // All routes under /api, URI-versioned (/api/v1/...).
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Drain in-flight work on SIGTERM/SIGINT.
  app.enableShutdownHooks();

  // OpenAPI — served outside production only.
  if (!config.isProduction) {
    const openapi = new DocumentBuilder()
      .setTitle('Blank App API')
      .setDescription('Blank App REST API')
      .setVersion('1.0')
      .addCookieAuth('session')
      .build();
    const document = SwaggerModule.createDocument(app, openapi);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(config.port);
}

void bootstrap();
