import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '../prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness probe (sin dependencias)' })
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('db')
  @ApiOperation({ summary: 'Readiness probe (verifica conexión a Postgres)' })
  @ApiServiceUnavailableResponse({ description: 'La base de datos no responde' })
  async checkDb() {
    try {
      await this.prisma.ping();
    } catch {
      // 503 para que un monitor que mira el código de estado detecte la caída
      throw new ServiceUnavailableException({
        status: 'error',
        db: 'down',
        timestamp: new Date().toISOString(),
      });
    }
    return { status: 'ok', db: 'up', timestamp: new Date().toISOString() };
  }
}
