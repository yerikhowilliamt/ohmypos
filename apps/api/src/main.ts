import type { Express } from 'express';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from './app.module';
import { PostgresTriggerExceptionFilter } from './common/filters/postgres-trigger-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Security headers & trusted reverse proxy (TASK-093 / DEF-A11)
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
  // Required for onModuleDestroy (PrismaService.$disconnect) to actually run
  // on SIGTERM/SIGINT — without this, Nest never calls it (Phase 14 E-9).
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('OhMyPos API')
    .setDescription('POS & back-office for a multi-branch F&B business')
    .setVersion('1.0')
    .build();
  // cleanupOpenApiDoc lets @nestjs/swagger render the Zod-derived DTOs, keeping
  // packages/api-contracts the single source of truth for the spec (Playbook §11).
  // TASK-095: Swagger only outside production.
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
  // Phase 14 E-9: the previous version had no `.catch` (a rejected close()
  // never exited) and no timeout guard (a hung close() hung forever, forcing
  // the orchestrator to SIGKILL). `shuttingDown` stops a second signal from
  // racing a second close() against the first.
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
