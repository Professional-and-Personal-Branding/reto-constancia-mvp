import { expect, test } from '@playwright/test';

import { SEED, STATE } from '../fixtures/api';

/**
 * Página Usuarios del admin (spec user-administration): buscar, activar y desactivar, cambiar el
 * rol y reiniciar la contraseña.
 * Casos cubiertos: TC-UI-12, TC-AUTH-21.
 *
 * Usa la sesión guardada del admin (sin login nuevo) y un usuario desechable registrado por API;
 * nunca un usuario del seed ni se degrada o desactiva al admin. Gasta un reinicio de contraseña
 * (límite de 5 por minuto) y un login (el que prueba la contraseña temporal).
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3002/api';

test.use({ storageState: STATE.admin });

test('el admin busca, desactiva, cambia el rol y reinicia la contraseña de un usuario', async ({ page, request }) => {
  const stamp = Date.now();
  const email = `reset-${stamp}@e2e.local`;
  const oldPassword = 'Actual123';
  const name = `José Usuarios ${stamp}`;

  const reg = await request.post(`${API_URL}/auth/register`, { data: { name, email, password: oldPassword } });
  expect(reg.status()).toBe(201);

  await page.goto('/dashboard');
  await page.getByRole('link', { name: 'Usuarios', exact: true }).click();
  await page.waitForURL('**/dashboard/admin/users');
  await expect(page.getByRole('heading', { name: 'Usuarios', exact: true })).toBeVisible();

  // La propia fila no ofrece acciones
  const search = page.getByLabel('Buscar por nombre o correo');
  await search.fill(SEED.admin.email);
  const own = page.getByTestId('user-row').filter({ hasText: SEED.admin.email });
  await expect(own.getByText('Tú', { exact: true })).toBeVisible();
  await expect(own.getByRole('link', { name: 'Cambiar mi contraseña' })).toBeVisible();
  await expect(own.getByRole('button')).toHaveCount(0);

  // Búsqueda sin mayúsculas ni tildes
  await search.fill(`jose usuarios ${stamp}`);
  const rows = page.getByTestId('user-row');
  await expect(rows).toHaveCount(1);
  const row = rows.first();
  await expect(row).toContainText(email);
  await expect(row.getByTestId('user-role')).toHaveText('Participante');
  await expect(row.getByTestId('user-status')).toHaveText('Activo');

  const confirmDialog = page.getByRole('dialog');

  // Desactivar (con confirmación) y volver a activar (sin ella)
  await row.getByRole('button', { name: 'Desactivar' }).click();
  await expect(confirmDialog).toContainText(`¿Desactivar a ${name}? No podrá entrar ni usar su sesión actual.`);
  await confirmDialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(row.getByTestId('user-status')).toHaveText('Activo');
  await row.getByRole('button', { name: 'Desactivar' }).click();
  await confirmDialog.getByRole('button', { name: 'Desactivar' }).click();
  await expect(row.getByTestId('user-status')).toHaveText('Inactivo');
  await row.getByRole('button', { name: 'Activar', exact: true }).click();
  await expect(row.getByTestId('user-status')).toHaveText('Activo');

  // Subir y bajar el rol
  await row.getByRole('button', { name: 'Hacer admin' }).click();
  await expect(confirmDialog).toContainText(`¿Dar permisos de administrador a ${name}?`);
  await confirmDialog.getByRole('button', { name: 'Confirmar' }).click();
  await expect(row.getByTestId('user-role')).toHaveText('Admin');
  await row.getByRole('button', { name: 'Quitar admin' }).click();
  await expect(confirmDialog).toContainText(`¿Quitar los permisos de administrador a ${name}?`);
  await confirmDialog.getByRole('button', { name: 'Confirmar' }).click();
  await expect(row.getByTestId('user-role')).toHaveText('Participante');

  // Reiniciar la contraseña: se muestra una vez y desaparece al cerrar
  await row.getByRole('button', { name: 'Reiniciar contraseña' }).click();
  await expect(confirmDialog).toContainText(`Se generará una contraseña temporal para ${name}`);
  await confirmDialog.getByRole('button', { name: 'Reiniciar' }).click();
  const shown = page.getByRole('dialog', { name: `Contraseña temporal de ${name}` });
  await expect(shown).toBeVisible();
  await expect(shown).toContainText('Se muestra una sola vez.');
  const temporary = await shown.getByTestId('temporary-password').inputValue();
  expect(temporary).toMatch(/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/);

  // Un solo login: la contraseña temporal sirve
  const login = await request.post(`${API_URL}/auth/login`, { data: { email, password: temporary } });
  expect(login.status()).toBe(200);

  await shown.getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.getByTestId('temporary-password')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(temporary);

  // Móvil (375 px): las filas se apilan y nada desborda
  await page.setViewportSize({ width: 375, height: 800 });
  await expect(row.getByRole('button', { name: 'Reiniciar contraseña' })).toBeInViewport();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBe(0);

  // Limpieza: el usuario desechable queda inactivo
  await row.getByRole('button', { name: 'Desactivar' }).click();
  await confirmDialog.getByRole('button', { name: 'Desactivar' }).click();
  await expect(row.getByTestId('user-status')).toHaveText('Inactivo');
});
