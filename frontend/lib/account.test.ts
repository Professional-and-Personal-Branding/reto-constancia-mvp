import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  accountErrorMessage,
  afterRefreshRejected,
  FALLBACK_MESSAGE,
  passwordsMatch,
  RATE_LIMIT_MESSAGE,
} from './account.ts';

test('Mi cuenta: el mensaje de la API se muestra tal cual, o el primero si es una lista', () => {
  assert.equal(accountErrorMessage(400, { message: 'Contraseña actual incorrecta' }), 'Contraseña actual incorrecta');
  assert.equal(
    accountErrorMessage(400, { message: ['La contraseña debe tener al menos 8 caracteres', 'otro'] }),
    'La contraseña debe tener al menos 8 caracteres',
  );
});

test('Mi cuenta: un 429 muestra el texto de demasiados intentos y un cuerpo ilegible el texto genérico', () => {
  assert.equal(accountErrorMessage(429, { message: 'ThrottlerException: Too Many Requests' }), RATE_LIMIT_MESSAGE);
  assert.equal(accountErrorMessage(500, null), FALLBACK_MESSAGE);
  assert.equal(accountErrorMessage(400, { message: [] }), FALLBACK_MESSAGE);
  assert.equal(FALLBACK_MESSAGE, 'No se pudo guardar. Inténtalo de nuevo.');
});

test('Mi cuenta: la confirmación debe coincidir exactamente', () => {
  assert.equal(passwordsMatch('Nuev0Pass2', 'Nuev0Pass2'), true);
  assert.equal(passwordsMatch('Nuev0Pass2', 'nuev0pass2'), false);
  assert.equal(passwordsMatch('Nuev0Pass2', ''), false);
});

test('Sesión: un refresh rechazado conserva los tokens que otra pestaña guardó mientras tanto', () => {
  const newer = { accessToken: 'a2', refreshToken: 'r2' };
  assert.equal(afterRefreshRejected(newer, 'r1'), 'retry');
});

test('Sesión: un refresh rechazado cierra la sesión si siguen guardados los mismos tokens o ninguno', () => {
  assert.equal(afterRefreshRejected({ accessToken: 'a1', refreshToken: 'r1' }, 'r1'), 'clear');
  assert.equal(afterRefreshRejected(null, 'r1'), 'clear');
});
