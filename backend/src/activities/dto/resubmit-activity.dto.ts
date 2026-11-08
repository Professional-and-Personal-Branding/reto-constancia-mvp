import { OmitType } from '@nestjs/swagger';

import { CreateActivityDto } from './create-activity.dto';

/**
 * Cuerpo del reenvío de una actividad rechazada (cambio resubmit-rejected-activity-2, design D2).
 * Es el estado completo de los datos corregibles: mismos validadores que al registrar, pero sin
 * reto, fecha ni prueba de FC (se deriva de las fotos). Cualquier otro campo da 400 por
 * `forbidNonWhitelisted`.
 */
export class ResubmitActivityDto extends OmitType(CreateActivityDto, [
  'challengeId',
  'date',
  'hasHeartRateProof',
] as const) {}
