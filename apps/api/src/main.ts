import type { Express } from 'express';
import * as Sentry from '@sentry/nestjs';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from './app.module';
import { PostgresTriggerExceptionFilter } from './common/filters/postgres-trigger-exception.filter';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Security headers; trust one reverse-proxy hop.
  app.use(helmet());
  const expressApp = app.getHttpAdapter().getInstance() as Express;
  expressApp.set('trust proxy', 1);

  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
    : ['http://localhost:3001'];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id'],
  });

  app.use(cookieParser());
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new PostgresTriggerExceptionFilter());
  // Without this, onModuleDestroy never runs on SIGTERM/SIGINT.
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('OhMyPos API')
    .setDescription('POS & back-office for a multi-branch F&B business')
    .setVersion('1.0')
    .build();
  // Swagger from Zod DTOs, outside production only.
  if (process.env.NODE_ENV !== 'production') {
    SwaggerModule.setup(
      'docs',
      app,
      cleanupOpenApiDoc(SwaggerModule.createDocument(app, config)),
    );
  }

  const port = process.env.PORT ?? 4015;
  await app.listen(port);

  const logger = app.get(Logger);
  // Single-flight graceful shutdown with a 10s forced-exit fallback.
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.log(`Received ${signal}, shutting down gracefully...`);

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out after 10s, forcing exit');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    app
      .close()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        logger.error({ err: error }, 'Error during graceful shutdown');
        process.exit(1);
      });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

void bootstrap();
