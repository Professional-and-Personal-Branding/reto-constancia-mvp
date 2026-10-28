import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

/**
 * Regla única de contraseña de cuenta (registro y cambio desde Mi cuenta):
 * 8 a 72 caracteres con al menos una letra y un número.
 */
export function IsAccountPassword(): PropertyDecorator {
  return applyDecorators(
    IsString(),
    MinLength(PASSWORD_MIN_LENGTH, { message: 'La contraseña debe tener al menos 8 caracteres' }),
    MaxLength(PASSWORD_MAX_LENGTH, { message: 'La contraseña no puede superar 72 caracteres' }),
    Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
      message: 'La contraseña debe incluir al menos una letra y un número',
    }),
  );
}
