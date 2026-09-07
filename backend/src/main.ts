import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.use(
    helmet({
      // Permite que el frontend (otro origen) cargue imágenes/archivos servidos por la API.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // Archivos subidos en modo local (simulador de Cloudinary). En producción se usa Cloudinary.
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });
  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN')?.split(',') ?? '*',
    credentials: true,
  });

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

  // Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Reto de Constancia API')
    .setDescription('API para administrar el reto mensual de constancia')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document);

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  logger.log(`🚀 API en http://localhost:${port}/${apiPrefix}`);
  logger.log(`📚 Swagger en http://localhost:${port}/${apiPrefix}/docs`);
}

bootstrap();
