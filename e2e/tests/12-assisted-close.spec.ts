import { expect, test } from '@playwright/test';

import {
  api,
  closeChallenge,
  createActivity,
  e2eDate,
  enroll,
  setupChallenge,
  STATE,
  tokens,
} from '../fixtures/api';
import { selectChallenge } from '../fixtures/ui';

/**
 * Cierre asistido (cambio assisted-challenge-close): antes de cerrar o premiar, la web muestra
 * la revisión previa y las pendientes exigen confirmar. Casos: TC-CHAL-20.
 *
 * Usa los meses 4 y 5 del año de pruebas: setupChallenge rehace los retos cerrados por otras specs.
 */
const CLOSE_MONTH = 4;
const AWARD_MONTH = 5;
const CLOSE_NAME = 'E2E Playwright · cierre asistido';
const AWARD_NAME = 'E2E Playwright · premiación asistida';

let closeId = '';
let awardId = '';

test.use({ storageState: STATE.admin });
test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  const { participantId, admin } = tokens();
  const toClose = await setupChallenge({ month: CLOSE_MONTH, name: CLOSE_NAME, feePerParticipant: 50 });
  closeId = toClose.id;
  await enroll(closeId, participantId);
  await createActivity(closeId, e2eDate(CLOSE_MONTH, 10)); // queda pendiente

  const toAward = await setupChallenge({ month: AWARD_MONTH, name: AWARD_NAME });
  awardId = toAward.id;
  await enroll(awardId, participantId);
  const act = await createActivity(awardId, e2eDate(AWARD_MONTH, 10));
  await api('POST', `/activities/${act.id}/validate`, { token: admin });
});

test.afterAll(async () => {
  await closeChallenge(CLOSE_MONTH);
  await closeChallenge(AWARD_MONTH);
});

test('si el cierre está en curso (409) el diálogo muestra el mensaje y ofrece reintentar', async ({ page }) => {
  await page.route('**/api/challenges/*/close', (route) =>
    route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ statusCode: 409, message: 'El reto se está cerrando; vuelve a intentarlo en unos segundos' }),
    }),
  );
  await page.goto('/dashboard/admin/challenges');
  await page.getByLabel(`Reto ${CLOSE_NAME}`).getByRole('button', { name: 'Cerrar reto' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Cerrar de todas formas: las actividades pendientes no contarán').check();
  await dialog.getByRole('button', { name: 'Cerrar reto' }).click();
  await expect(dialog.getByRole('alert')).toContainText('El reto se está cerrando');
  await expect(dialog.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  await page.unroute('**/api/challenges/*/close');
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toHaveCount(0);
});

test('las pendientes bloquean el cierre hasta confirmarlas; los impagos solo informan', async ({ page }) => {
  await page.goto('/dashboard/admin/challenges');
  const row = page.getByLabel(`Reto ${CLOSE_NAME}`);
  await row.getByRole('button', { name: 'Cerrar reto' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('1 actividad pendiente no contará para el puntaje.');
  await expect(dialog).toContainText('Pueden ganar igual; el pote es lo recaudado.');
  await expect(dialog).toContainText('Proyección: al cerrar se vuelve a calcular');
  const confirm = dialog.getByRole('button', { name: 'Cerrar reto' });
  await expect(confirm).toBeDisabled();

  await dialog.getByLabel('Cerrar de todas formas: las actividades pendientes no contarán').check();
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(dialog).toHaveCount(0);
  await expect(row).toContainText('Cerrado');
});

test('guardar la premiación pasa por la revisión y cierra el reto con esos premiados', async ({ page }) => {
  await selectChallenge(page, awardId, '/dashboard/results');
  await page.getByRole('button', { name: 'Guardar premiación' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Se premiará a');
  await expect(dialog).toContainText('No hay actividades pendientes.');
  await dialog.getByRole('button', { name: 'Guardar premiación y cerrar' }).click();
  await expect(dialog).toHaveCount(0);

  const results = await api<{ status: string; awards: { userId: string }[] }>('GET', `/challenges/${awardId}/results`, {
    token: tokens().admin,
  });
  expect(results.body.status).toBe('COMPLETED');
  expect(results.body.awards.map((a) => a.userId)).toEqual([tokens().participantId]);
});
