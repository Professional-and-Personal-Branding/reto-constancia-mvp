import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';
import { corsWarning, resolveCorsOrigin } from './common/cors';
import { resolveSwaggerEnabled, resolveTrustProxy } from './common/http';
import { applyRequestContext } from './common/request-context';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  // Antes que body-parser y que cualquier ruta: toda respuesta lleva X-Request-Id
  applyRequestContext(app);
  // SIGTERM/SIGINT ejecutan onModuleDestroy (cierra la conexión a la base) antes de salir
  app.enableShutdownHooks();
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Detrás de un proxy, el limitador debe ver la IP real del usuario y no la del proxy.
  const trustProxy = resolveTrustProxy({
    NODE_ENV: config.get<string>('NODE_ENV'),
    TRUST_PROXY: config.get<string>('TRUST_PROXY'),
  });
  app.set('trust proxy', trustProxy);

  app.use(
    helmet({
      // Permite que el frontend (otro origen) cargue imágenes/archivos servidos por la API.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Archivos subidos en modo local (simulador de Cloudinary). En producción se usa Cloudinary.
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });
  const corsEnv = {
    CORS_ORIGIN: config.get<string>('CORS_ORIGIN'),
    NODE_ENV: config.get<string>('NODE_ENV'),
  };
  const corsOrigin = resolveCorsOrigin(corsEnv);
  const corsIssue = corsWarning(corsOrigin, corsEnv);
  if (corsIssue) {
    new Logger('Bootstrap')[corsEnv.NODE_ENV === 'production' ? 'error' : 'warn'](corsIssue);
  }
  app.enableCors({ origin: corsOrigin, credentials: true, exposedHeaders: ['X-Request-Id'] });

  const apiPrefix = config.get<string>('API_PREFIX', 'api');
  app.setGlobalPrefix(apiPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Swagger: apagado por defecto en producción (SWAGGER_ENABLED=true lo enciende)
  const swaggerEnabled = resolveSwaggerEnabled({
    NODE_ENV: config.get<string>('NODE_ENV'),
    SWAGGER_ENABLED: config.get<string>('SWAGGER_ENABLED'),
  });
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Reto de Constancia API')
      .setDescription('API para administrar el reto mensual de constancia')
      .setVersion('1.7.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${apiPrefix}/docs`, app, document);
  }

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  logger.log(`🚀 API en http://localhost:${port}/${apiPrefix}`);
  if (swaggerEnabled) logger.log(`📚 Swagger en http://localhost:${port}/${apiPrefix}/docs`);
}

bootstrap();
