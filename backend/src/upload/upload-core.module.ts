import { Module } from '@nestjs/common';

import { UploadService } from './upload.service';

/**
 * Servicio de subidas sin dependencias de otros módulos de la app (firma, verificación de
 * evidencia propia y simulador local). Lo importan retos y actividades sin crear ciclos.
 */
@Module({
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadCoreModule {}
