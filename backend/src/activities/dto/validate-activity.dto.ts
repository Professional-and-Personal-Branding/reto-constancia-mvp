import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

/**
 * Cuerpo opcional de POST /activities/:id/validate.
 * Solo es necesario cuando la actividad NO cumple la regla de FC del reto:
 * el admin debe enviar `override: true` y una `note` que quede registrada.
 */
export class ValidateActivityDto {
  @ApiPropertyOptional({
    description: 'Validar aunque la actividad no cumpla la regla de FC del reto',
  })
  @IsOptional()
  @IsBoolean()
  override?: boolean;

  @ApiPropertyOptional({
    minLength: 5,
    maxLength: 300,
    description: 'Motivo del override; se guarda como validationNote',
  })
  @IsOptional()
  @IsString()
  @Length(5, 300)
  note?: string;
}
