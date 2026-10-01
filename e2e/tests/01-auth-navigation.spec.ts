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

  test('un 429 transitorio al cargar el perfil no cierra la sesión', async ({ page }) => {
    // Las dos primeras consultas del perfil responden 429, como en un pico de tráfico
    let blocked = 0;
    await page.route('**/api/auth/me', async (route) => {
      if (blocked < 2) {
        blocked++;
        await route.fulfill({ status: 429, contentType: 'application/json', body: '{"statusCode":429,"message":"ThrottlerException: Too Many Requests"}' });
        return;
      }
      await route.continue();
    });

    await page.goto('/dashboard');
    await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible({ timeout: 15_000 });
    expect(page.url()).toContain('/dashboard');
    expect(blocked).toBe(2);
    const stored = await page.evaluate(() => window.localStorage.getItem('reto.tokens'));
    expect(stored).toBeTruthy();
  });

  test('un access token vencido se renueva solo con el refresh token', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible();
    // Se escucha antes de invalidar: una consulta en segundo plano puede disparar la renovación
    // apenas cambia el token, antes incluso de recargar.
    const refreshed = page.waitForResponse((r) => r.url().includes('/api/auth/refresh') && r.ok());
    // Una firma alterada hace que la API rechace el token igual que si hubiera vencido
    const broken = await page.evaluate(() => {
      const tokens = JSON.parse(window.localStorage.getItem('reto.tokens') ?? '{}');
      tokens.accessToken = tokens.accessToken.slice(0, -6) + 'vencid';
      window.localStorage.setItem('reto.tokens', JSON.stringify(tokens));
      return tokens.accessToken as string;
    });

    await page.reload();
    await refreshed;
    await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible();
    expect(page.url()).toContain('/dashboard');
    const current = await page.evaluate(() => JSON.parse(window.localStorage.getItem('reto.tokens') ?? '{}').accessToken);
    expect(current).toBeTruthy();
    expect(current).not.toBe(broken);
  });

  test('un corte de red al renovar el token no cierra la sesión', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible();
    // La primera renovación se corta (red caída o navegación); las siguientes llegan al servidor
    let aborted = 0;
    await page.route('**/api/auth/refresh', async (route) => {
      if (aborted === 0) {
        aborted++;
        await route.abort('failed');
        return;
      }
      await route.continue();
    });
    const broken = await page.evaluate(() => {
      const tokens = JSON.parse(window.localStorage.getItem('reto.tokens') ?? '{}');
      tokens.accessToken = tokens.accessToken.slice(0, -6) + 'vencid';
      window.localStorage.setItem('reto.tokens', JSON.stringify(tokens));
      return tokens.accessToken as string;
    });

    await page.reload();
    await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible({ timeout: 15_000 });
    expect(page.url()).toContain('/dashboard');
    expect(aborted).toBe(1);
    const current = await page.evaluate(() => JSON.parse(window.localStorage.getItem('reto.tokens') ?? '{}').accessToken);
    expect(current).toBeTruthy();
    expect(current).not.toBe(broken);
  });

  test('si el refresh token también es inválido, vuelve al login y borra la sesión', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible();
    await page.evaluate(() => {
      const tokens = JSON.parse(window.localStorage.getItem('reto.tokens') ?? '{}');
      tokens.accessToken = tokens.accessToken.slice(0, -6) + 'vencid';
      tokens.refreshToken = tokens.refreshToken.slice(0, -6) + 'vencid';
      window.localStorage.setItem('reto.tokens', JSON.stringify(tokens));
    });

    await page.reload();
    await page.waitForURL('**/login');
    expect(await page.evaluate(() => window.localStorage.getItem('reto.tokens'))).toBeNull();
  });

  test('el admin ve las cuatro secciones de administración', async ({ page }) => {
    await page.goto('/dashboard');
    for (const label of ['Validar', 'Participantes', 'Importar', 'Retos']) {
      await expect(page.getByRole('link', { name: label })).toBeVisible();
    }
  });
});
