import { expect, Page, test } from '@playwright/test';

import { closeChallenge, setupChallenge, STATE } from '../fixtures/api';

/**
 * El encabezado entra completo en escritorio y en móvil, para el administrador (siete
 * secciones) y el participante, y el selector muestra el nombre del reto sin cortarlo.
 * Casos cubiertos: TC-UI-10.
 */
const MONTH = 12;

test.beforeAll(async () => {
  // Un segundo reto activo para que aparezca el selector de reto en el encabezado
  await setupChallenge({ month: MONTH, name: 'E2E Playwright · encabezado' });
});

test.afterAll(async () => {
  await closeChallenge(MONTH);
});

/** Ancho del texto elegido en el selector frente al espacio que tiene para mostrarlo. */
async function selectorFit(page: Page) {
  return page.getByLabel('Reto activo seleccionado').evaluate((el) => {
    const select = el as HTMLSelectElement;
    const style = getComputedStyle(select);
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const text = select.selectedOptions[0]?.text ?? '';
    const available =
      select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 20; // flecha nativa
    return { text, needed: Math.ceil(ctx.measureText(text).width), available: Math.floor(available) };
  });
}

const overflow = (page: Page) =>
  page.evaluate(() => ({
    page: document.documentElement.scrollWidth - window.innerWidth,
    header: (() => {
      const header = document.querySelector('header')!;
      return header.scrollWidth - header.clientWidth;
    })(),
  }));

for (const [role, state] of [['administrador', STATE.admin], ['participante', STATE.participant]] as const) {
  test.describe(`Encabezado del ${role}`, () => {
    test.use({ storageState: state });

    test(`en escritorio el ${role} ve el nombre del reto completo y nada se desborda`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/dashboard');
      await expect(page.getByLabel('Reto activo seleccionado')).toBeVisible();
      const fit = await selectorFit(page);
      expect(fit.needed, `"${fit.text}" necesita ${fit.needed}px y tiene ${fit.available}px`).toBeLessThanOrEqual(fit.available);
      expect(await overflow(page)).toEqual({ page: 0, header: 0 });
      await expect(page.getByRole('button', { name: 'Salir' })).toBeInViewport();
    });

    test(`en móvil el encabezado del ${role} no desborda la página`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/dashboard');
      await expect(page.getByRole('button', { name: 'Salir' })).toBeInViewport();
      await expect(page.getByRole('switch', { name: 'Modo claro' })).toBeInViewport();
      expect((await overflow(page)).page).toBe(0);
    });
  });
}
