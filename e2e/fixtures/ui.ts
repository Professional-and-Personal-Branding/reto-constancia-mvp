import { expect, Page } from '@playwright/test';

/**
 * Ayudas de UI compartidas por los recorridos.
 */

/**
 * Fija el reto sobre el que trabaja la app.
 *
 * La web guarda la selección en `localStorage`; fijarla antes de navegar evita depender del
 * orden de los retos activos y hace las pruebas deterministas.
 */
export async function selectChallenge(page: Page, challengeId: string, path = '/dashboard') {
  await page.goto(path);
  await page.evaluate((id) => window.localStorage.setItem('reto.selectedChallengeId', id), challengeId);
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}

/** Imagen PNG mínima válida, para las pruebas que suben fotos. */
export function pngFile(name: string) {
  const base64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  return { name, mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}

/** Texto del bloque principal, útil para aserciones amplias. */
export async function mainText(page: Page): Promise<string> {
  return (await page.locator('main').innerText()).replace(/\s+/g, ' ');
}

export async function expectSignedIn(page: Page) {
  await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible();
}
