import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from './app.module';
import { PostgresTriggerExceptionFilter } from './common/filters/postgres-trigger-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
    : ['http://localhost:3001'];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.use(cookieParser());
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new PostgresTriggerExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('OhMyPos API')
    .setDescription('POS & back-office for a multi-branch F&B business')
    .setVersion('1.0')
    .build();
  // cleanupOpenApiDoc lets @nestjs/swagger render the Zod-derived DTOs, keeping
  // packages/api-contracts the single source of truth for the spec (Playbook §11).
  SwaggerModule.setup(
    'docs',
    app,
    cleanupOpenApiDoc(SwaggerModule.createDocument(app, config)),
  );

  const port = process.env.PORT ?? 4013;
  await app.listen(port);

  const logger = app.get(Logger);
  const shutdown = (signal: string) => {
    logger.log(`Received ${signal}, shutting down gracefully...`);
    void app.close().then(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

void bootstrap();
