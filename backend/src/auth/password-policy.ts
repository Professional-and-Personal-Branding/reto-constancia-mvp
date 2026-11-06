import { randomInt } from 'node:crypto';

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

// 56 caracteres sin confundibles: sin I, O, l, o, 0 ni 1.
const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/**
 * Contraseña temporal que entrega el admin (spec user-administration): 12 caracteres uniformes
 * de `TEMP_ALPHABET` en grupos `xxxx-xxxx-xxxx`, con al menos una letra y un número para cumplir
 * `IsAccountPassword`. Usa `crypto.randomInt`.
 */
export function generateTemporaryPassword(): string {
  for (;;) {
    let raw = '';
    for (let i = 0; i < 12; i++) raw += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
    if (/[A-Za-z]/.test(raw) && /\d/.test(raw)) {
      return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
    }
  }
}
