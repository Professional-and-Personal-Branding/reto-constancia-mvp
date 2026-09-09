import { expect, test } from '@playwright/test';

import { SEED, STATE } from '../fixtures/api';
import { expectSignedIn } from '../fixtures/ui';

/**
 * Recorrido 1 de docs/test-cases.md: alta, sesión y rutas protegidas.
 * Casos cubiertos: TC-AUTH-02, TC-AUTH-04, TC-UI-01, TC-UI-02.
 */
test.describe('Sesión y rutas protegidas', () => {
  test('una ruta privada sin sesión redirige al login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/dashboard');
    await page.waitForURL('**/login');
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  });

  test('el registro exige una contraseña que cumpla la política', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Nombre').fill('QA Playwright');
    await page.getByLabel('Email').fill(`qa-playwright-${Date.now()}@reto.local`);
    await page.getByLabel('Contraseña').fill('corta');
    await page.getByRole('button', { name: /Crear cuenta|Registrarme|Entrar/ }).click();

    await expect(page).toHaveURL(/\/register/);
    await expect(page.locator('main')).toContainText(/contraseña|password/i);
  });

  test('el participante entra y no ve las secciones de administración', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(SEED.participant.email);
    await page.getByLabel('Contraseña').fill(SEED.participant.password);
    await page.getByRole('button', { name: 'Entrar' }).click();

    await page.waitForURL('**/dashboard');
    await expectSignedIn(page);
    await expect(page.getByRole('link', { name: 'Mi reto' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Validar' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Retos' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Salir' }).click();
    await page.waitForURL('**/login');
  });
});

test.describe('Sesión de administración', () => {
  test.use({ storageState: STATE.admin });

  test('el admin ve las cuatro secciones de administración', async ({ page }) => {
    await page.goto('/dashboard');
    for (const label of ['Validar', 'Participantes', 'Importar', 'Retos']) {
      await expect(page.getByRole('link', { name: label })).toBeVisible();
    }
  });
});
