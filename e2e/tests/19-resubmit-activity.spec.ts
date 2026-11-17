import { expect, Page, test } from '@playwright/test';

import { api, closeChallenge, createActivity, e2eDate, enroll, setupChallenge, STATE, tokens } from '../fixtures/api';
import { pngFile, selectChallenge } from '../fixtures/ui';

/**
 * Corregir y reenviar una actividad rechazada desde la web (cambio resubmit-rejected-activity-2).
 * Casos cubiertos: TC-UI-15 (con TC-ACT-29 y TC-ACT-30 en la API).
 *
 * Todo a 375 px: es el ancho donde la fila rechazada, el formulario y el aviso podrían romperse.
 */
const MONTH_A = 3;
const MONTH_B = 6;
const NAME_A = 'E2E Playwright · reenvío A';
const NAME_B = 'E2E Playwright · reenvío B';
const REASON_1 = 'Falta la captura de FC';
const REASON_2 = 'La foto no se ve';

let challengeA = '';
let challengeB = '';
let firstId = '';
let secondId = '';

test.use({ viewport: { width: 375, height: 812 } });

test.beforeAll(async () => {
  // Las actividades se crean sin regla de FC y luego se sube el mínimo: la rechazada necesita
  // la captura al reenviarse
  const a = await setupChallenge({ month: MONTH_A, name: NAME_A, minHeartRateMinutes: 0 });
  challengeA = a.id;
  const b = await setupChallenge({ month: MONTH_B, name: NAME_B, minHeartRateMinutes: 0 });
  challengeB = b.id;
  await enroll(challengeA, tokens().participantId);
  await enroll(challengeB, tokens().participantId);

  firstId = (await createActivity(challengeA, e2eDate(MONTH_A, 9), { distanceKm: 4 })).id;
  secondId = (await createActivity(challengeA, e2eDate(MONTH_A, 10), { distanceKm: 5 })).id;
  await api('PATCH', `/challenges/${challengeA}`, { token: tokens().admin, body: { minHeartRateMinutes: 20 } });
  for (const [id, reason] of [
    [firstId, REASON_1],
    [secondId, REASON_2],
  ]) {
    const res = await api('POST', `/activities/${id}/reject`, { token: tokens().admin, body: { reason } });
    expect([200, 201]).toContain(res.status);
  }
});

test.afterAll(async () => {
  await closeChallenge(MONTH_A);
  await closeChallenge(MONTH_B);
});

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('Participante', () => {
  test.use({ storageState: STATE.participant });

  test('corrige una rechazada: formulario con la foto guardada, reenvío y aviso con foco', async ({ page }) => {
    await selectChallenge(page, challengeA, '/dashboard');
    const row = page.locator(`#actividad-${firstId}`);
    await expect(row).toContainText(REASON_1);
    await expect(row).toContainText('Puedes corregirla y reenviarla, o retirarla y registrar ese día de nuevo.');

    // "Corregir y reenviar" va primero y "Retirar" después; la fila cabe en el teléfono
    await expect(row.locator('a, button')).toHaveText(['Corregir y reenviar', 'Retirar']);
    await expectNoHorizontalScroll(page);

    await row.getByRole('link', { name: 'Corregir y reenviar' }).click();
    await expect(page).toHaveURL(new RegExp(`/dashboard/upload[?]reenviar=${firstId}`));
    await expect(page.getByRole('heading', { name: 'Corregir y reenviar' })).toBeVisible();
    await expect(page.getByLabel('Fecha')).toBeDisabled();
    // La foto guardada viene precargada y sin captura de FC el envío está bloqueado
    await expect(page.getByAltText('Foto del entrenamiento guardada')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reenviar' })).toBeDisabled();
    await expectNoHorizontalScroll(page);

    await page.getByLabel('Minutos con FC').fill('25');
    await page.locator('input[type="file"]').nth(1).setInputFiles(pngFile('frecuencia.png'));
    await expect(page.getByRole('button', { name: 'Reenviar' })).toBeEnabled();
    await page.getByRole('button', { name: 'Reenviar' }).click();

    await page.waitForURL('**/dashboard', { timeout: 30_000 });
    const notice = page.getByRole('status').filter({ hasText: 'Actividad reenviada. Queda pendiente de validación.' });
    await expect(notice).toBeVisible();
    await expect(notice).toBeFocused();

    // La fila queda pendiente y conserva el rechazo anterior, que se abre con el teclado
    const pending = page.locator(`#actividad-${firstId}`);
    await expect(pending).toContainText('Pendiente');
    await expect(pending.getByRole('link', { name: 'Corregir y reenviar' })).toHaveCount(0);
    const summary = pending.getByText('Rechazos anteriores (1)');
    await expect(summary).toBeVisible();
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(pending).toContainText(REASON_1);
    await expectNoHorizontalScroll(page);

    const read = await api<{ status: string; resubmissionCount: number; rejectionReason: string | null }>(
      'GET',
      `/activities/${firstId}`,
      { token: tokens().participant },
    );
    expect(read.body.status).toBe('PENDING');
    expect(read.body.resubmissionCount).toBe(1);
    expect(read.body.rejectionReason).toBeNull();
  });

  test('con otro reto seleccionado, la actividad se reenvía en su propio reto', async ({ page }) => {
    await selectChallenge(page, challengeB, `/dashboard/upload?reenviar=${secondId}`);
    await expect(page.getByRole('heading', { name: 'Corregir y reenviar' })).toBeVisible();
    // La regla de FC es la del reto A (20 min), no la del B (sin mínimo)
    await expect(page.locator('main')).toContainText('al menos 20 min de registro');

    await page.getByLabel('Minutos con FC').fill('30');
    await page.locator('input[type="file"]').nth(1).setInputFiles(pngFile('frecuencia.png'));
    await page.getByRole('button', { name: 'Reenviar' }).click();
    await page.waitForURL('**/dashboard', { timeout: 30_000 });

    const read = await api<{ status: string; challengeId: string }>('GET', `/activities/${secondId}`, {
      token: tokens().participant,
    });
    expect(read.body.status).toBe('PENDING');
    expect(read.body.challengeId).toBe(challengeA);
  });
});

test.describe('Administrador', () => {
  test.use({ storageState: STATE.admin });

  test('ve "Reenviada" y el motivo anterior en la cola y valida', async ({ page }) => {
    await selectChallenge(page, challengeA, '/dashboard/admin/validations');
    const card = page.locator('.card').filter({ hasText: 'Rechazos anteriores' }).filter({ hasText: REASON_1 });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('Reenviada');
    await expect(card).toContainText('Rechazos anteriores (1)');
    await expectNoHorizontalScroll(page);

    await card.getByRole('button', { name: /Validar/ }).click();
    await expect(page.locator('.card').filter({ hasText: REASON_1 })).toHaveCount(0);

    const read = await api<{ status: string }>('GET', `/activities/${firstId}`, { token: tokens().admin });
    expect(read.body.status).toBe('VALIDATED');
  });
});

test.describe('Enlace desactualizado', () => {
  test.use({ storageState: STATE.participant });

  test('una actividad que ya no está rechazada muestra el aviso y un enlace de vuelta', async ({ page }) => {
    await selectChallenge(page, challengeA, `/dashboard/upload?reenviar=${firstId}`);
    await expect(page.getByText('Esta actividad ya no se puede reenviar.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reenviar' })).toHaveCount(0);
    await page.getByRole('link', { name: 'Volver a Mi reto' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
