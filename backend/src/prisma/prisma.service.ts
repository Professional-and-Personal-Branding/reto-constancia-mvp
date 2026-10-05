import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger('Prisma');

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Conexión a la base cerrada');
  }

  /** Comprueba que la base responde (readiness probe). */
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
