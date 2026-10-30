import { expect, test } from '@playwright/test';

/**
 * Mi cuenta (spec account-self-service): nombre y contraseña desde la web.
 * Casos cubiertos: TC-AUTH-15, TC-AUTH-16, TC-AUTH-17.
 *
 * Usa un usuario desechable creado por la API (sin login: el límite es de 5 por minuto) y nunca
 * un usuario del seed: cambiar su contraseña cerraría las sesiones que comparten los demás
 * recorridos. En total: un registro y dos cambios de contraseña.
 */
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3002/api';

test('cambia su nombre y su contraseña desde Mi cuenta', async ({ page, request }) => {
  const email = `account-${Date.now()}@e2e.local`;
  const oldPassword = 'Actual123';
  const newPassword = 'Nuev0Pass2';

  const reg = await request.post(`${API_URL}/auth/register`, {
    data: { name: 'Cuenta Playwright', email, password: oldPassword },
  });
  expect(reg.status()).toBe(201);
  const { tokens } = (await reg.json()) as { tokens: { accessToken: string; refreshToken: string } };

  await page.addInitScript((value) => {
    if (!window.localStorage.getItem('reto.tokens')) window.localStorage.setItem('reto.tokens', value);
  }, JSON.stringify(tokens));

  const passwordRequests: string[] = [];
  const refreshRequests: string[] = [];
  page.on('request', (req) => {
    if (req.url().endsWith('/users/me/password')) passwordRequests.push(req.method());
    if (req.url().endsWith('/auth/refresh')) refreshRequests.push(req.method());
  });

  await page.goto('/dashboard');
  await page.getByRole('link', { name: 'Mi cuenta' }).click();
  await page.waitForURL('**/dashboard/account');
  await expect(page.getByTestId('account-email')).toHaveText(email);

  // Nombre
  const nameForm = page.getByRole('form', { name: 'Nombre' });
  await nameForm.getByRole('textbox', { name: 'Nombre' }).fill('  Ana María  ');
  await nameForm.getByRole('button', { name: 'Guardar nombre' }).click();
  await expect(page.getByText('Nombre actualizado.')).toBeVisible();
  await expect(page.locator('header').getByText('Ana María', { exact: true })).toBeVisible();

  const passwordForm = page.getByRole('form', { name: 'Contraseña' });
  const fill = async (current: string, next: string, confirmation: string) => {
    await passwordForm.getByLabel('Contraseña actual').fill(current);
    await passwordForm.getByLabel('Nueva contraseña', { exact: true }).fill(next);
    await passwordForm.getByLabel('Repite la nueva contraseña').fill(confirmation);
    await passwordForm.getByRole('button', { name: 'Cambiar contraseña' }).click();
  };

  // La confirmación distinta no llama a la API
  await fill(oldPassword, newPassword, 'Otra0Clave9');
  await expect(page.getByText('Las contraseñas no coinciden')).toBeVisible();
  expect(passwordRequests).toEqual([]);

  // La contraseña actual incorrecta es un error del formulario: ni renueva el token ni cierra la sesión
  await fill('Equivocada1', newPassword, newPassword);
  await expect(page.getByText('Contraseña actual incorrecta')).toBeVisible();
  expect(passwordRequests).toEqual(['PATCH']);
  expect(refreshRequests).toEqual([]);
  await expect(page).toHaveURL(/\/dashboard\/account$/);

  // Cambio correcto: tokens nuevos guardados, campos vacíos y la sesión sigue tras recargar
  const before = await page.evaluate(
    () => JSON.parse(window.localStorage.getItem('reto.tokens')!).refreshToken as string,
  );
  await fill(oldPassword, newPassword, newPassword);
  await expect(
    page.getByText('Contraseña actualizada. Se cerraron las sesiones abiertas en otros dispositivos.'),
  ).toBeVisible();
  await expect(passwordForm.getByLabel('Contraseña actual')).toHaveValue('');
  await expect(passwordForm.getByLabel('Nueva contraseña', { exact: true })).toHaveValue('');
  await expect(passwordForm.getByLabel('Repite la nueva contraseña')).toHaveValue('');
  const after = await page.evaluate(
    () => JSON.parse(window.localStorage.getItem('reto.tokens')!).refreshToken as string,
  );
  expect(after).not.toBe(before);
  expect(passwordRequests).toEqual(['PATCH', 'PATCH']);

  await page.reload();
  await expect(page).toHaveURL(/\/dashboard\/account$/);
  await expect(page.getByTestId('account-email')).toHaveText(email);
});
