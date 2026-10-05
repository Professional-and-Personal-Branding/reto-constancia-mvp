import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { resolveThrottle } from './common/http';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { RouteTemplateInterceptor } from './common/route-template.interceptor';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ChallengesModule } from './challenges/challenges.module';
import { ActivitiesModule } from './activities/activities.module';
import { UploadModule } from './upload/upload.module';
import { ImportModule } from './import/import.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Límite global por cliente (configurable con THROTTLE_LIMIT y THROTTLE_TTL_MS)
    ThrottlerModule.forRoot([resolveThrottle(process.env)]),
    PrismaModule,
    AuthModule,
    UsersModule,
    ChallengesModule,
    ActivitiesModule,
    UploadModule,
    ImportModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Errores sin detalles internos y con identificador de petición (spec platform-operations)
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: RouteTemplateInterceptor },
  ],
})
export class AppModule {}
