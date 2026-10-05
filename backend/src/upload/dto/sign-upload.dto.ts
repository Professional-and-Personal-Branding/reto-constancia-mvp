import { IsIn, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { UPLOAD_PURPOSES, UploadPurpose } from '../upload-policy';

/** La carpeta y el tipo de recurso los decide el servidor (spec upload-guardrails). */
export class SignUploadDto {
  @ApiProperty({ description: 'Reto al que pertenece la subida', format: 'uuid' })
  @IsUUID()
  challengeId!: string;

  @ApiProperty({ enum: UPLOAD_PURPOSES, description: 'Foto de actividad o comprobante de pago' })
  @IsIn(UPLOAD_PURPOSES)
  purpose!: UploadPurpose;
}
