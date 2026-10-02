import { expect, Page, test } from '@playwright/test';

import { STATE } from '../fixtures/api';

/**
 * Tema claro/oscuro (spec web-theme): por defecto sigue al sistema, el interruptor del
 * encabezado lo cambia y la elección se recuerda por navegador sin parpadeo.
 * Casos cubiertos: TC-UI-06, TC-UI-07, TC-UI-08, TC-UI-09.
 */
const LIGHT_BG = 'rgb(246, 245, 242)';
const DARK_BG = 'rgb(10, 10, 10)';

const theme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme);
const bodyBg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe('Tema por defecto', () => {
  test('sin elección guardada sigue el tema del sistema', async ({ browser }) => {
    for (const [colorScheme, expected, bg] of [['light', 'light', LIGHT_BG], ['dark', 'dark', DARK_BG]] as const) {
      const context = await browser.newContext({ colorScheme });
      const page = await context.newPage();
      await page.goto('/login');
      expect(await theme(page)).toBe(expected);
      expect(await bodyBg(page)).toBe(bg);
      await context.close();
    }
  });

  test('si el sistema cambia, la app lo sigue sin recargar', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();
    await page.goto('/login');
    await expect(page.getByRole('switch', { name: 'Modo claro' })).toBeVisible();
    expect(await theme(page)).toBe('dark');

    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => theme(page)).toBe('light');
    await expect(page.getByRole('switch', { name: 'Modo claro' })).toHaveAttribute('aria-checked', 'true');
    await context.close();
  });

  test('el tema guardado se aplica antes de pintar y manda sobre el sistema', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'dark' });
    await context.addInitScript(() => {
      window.localStorage.setItem('reto.theme', 'light');
      // Tema presente cuando el documento termina de analizarse, antes de que React hidrate
      document.addEventListener('DOMContentLoaded', () => {
        (window as unknown as { __themeAtDcl?: string }).__themeAtDcl = document.documentElement.dataset.theme;
      });
    });
    const page = await context.newPage();
    await page.goto('/login');
    expect(await page.evaluate(() => (window as unknown as { __themeAtDcl?: string }).__themeAtDcl)).toBe('light');
    expect(await bodyBg(page)).toBe(LIGHT_BG);
    await context.close();
  });
});

test.describe('Interruptor de tema', () => {
  test.use({ storageState: STATE.participant, colorScheme: 'dark' });

  test('el interruptor cambia el tema al instante y la elección sobrevive la recarga', async ({ page }) => {
    await page.goto('/dashboard');
    const toggle = page.getByRole('switch', { name: 'Modo claro' });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(await theme(page)).toBe('light');
    expect(await bodyBg(page)).toBe(LIGHT_BG);
    expect(await page.evaluate(() => window.localStorage.getItem('reto.theme'))).toBe('light');

    await page.reload();
    expect(await theme(page)).toBe('light');
    await expect(page.getByRole('switch', { name: 'Modo claro' })).toHaveAttribute('aria-checked', 'true');

    // La elección guardada manda: un cambio del sistema ya no la altera
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(200);
    expect(await theme(page)).toBe('light');
  });

  test('el interruptor funciona con el teclado', async ({ page }) => {
    await page.goto('/dashboard');
    const toggle = page.getByRole('switch', { name: 'Modo claro' });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(await theme(page)).toBe('light');

    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(await theme(page)).toBe('dark');
  });

  test('las pantallas principales y los controles nativos se ven en modo claro', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('reto.theme', 'light'));
    for (const path of ['/dashboard', '/dashboard/upload', '/dashboard/results']) {
      await page.goto(path);
      await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible();
      expect(await bodyBg(page), path).toBe(LIGHT_BG);
      expect(await page.locator('main').evaluate((el) => getComputedStyle(el).color), path).toBe('rgb(21, 21, 21)');
    }
    // Las tarjetas de "Mi reto" usan la superficie clara, no la oscura de siempre
    await page.goto('/dashboard');
    const card = page.locator('.card').first();
    await expect(card).toBeVisible();
    expect(await card.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
    // En Subir actividad, los controles nativos siguen el tema
    await page.goto('/dashboard/upload');
    const date = page.locator('input[type="date"]').first();
    await expect(date).toBeVisible();
    expect(await date.evaluate((el) => getComputedStyle(el).colorScheme)).toBe('light');
  });
});
