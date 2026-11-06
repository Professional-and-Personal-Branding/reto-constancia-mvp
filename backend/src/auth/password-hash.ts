import * as argon2 from 'argon2';

/**
 * Parámetros de argon2 de toda contraseña del sistema. Hoy son los de la
 * librería (argon2id, m=65536, t=3, p=4); cambiarlos aquí los cambia también
 * en el hash señuelo del login.
 */
export const PASSWORD_HASH_OPTIONS: argon2.Options = {};

/** Único camino para hashear contraseñas en el backend. */
export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, PASSWORD_HASH_OPTIONS);
}
