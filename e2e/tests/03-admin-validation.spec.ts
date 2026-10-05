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

/**
 * Recorrido 4 de docs/test-cases.md: validar y rechazar como admin.
 * Casos cubiertos: TC-ACT-08, TC-ACT-09, TC-ACT-15, TC-UI-11.
 */
const MONTH = 4;
const COMPLIANT_DATE = e2eDate(MONTH, 10);
const NON_COMPLIANT_DATE = e2eDate(MONTH, 11);
const ERROR_DATE = e2eDate(MONTH, 12);

test.use({ storageState: STATE.admin });

test.beforeAll(async () => {
  // Se crean las actividades con el reto sin regla de FC y luego se sube el mínimo:
  // la conformidad se evalúa al leer, así que la segunda queda "no cumple".
  const challenge = await setupChallenge({
    month: MONTH,
    name: 'E2E Playwright · validación',
    minHeartRateMinutes: 0,
  });
  await enroll(challenge.id, tokens().participantId);
  await createActivity(challenge.id, COMPLIANT_DATE, {
    heartRateMinutes: 30,
    withHeartRatePhoto: true,
  });
  await createActivity(challenge.id, NON_COMPLIANT_DATE, {});
  await createActivity(challenge.id, ERROR_DATE, { heartRateMinutes: 30, withHeartRatePhoto: true });
  await api('PATCH', `/challenges/${challenge.id}`, {
    token: tokens().admin,
    body: { minHeartRateMinutes: 20 },
  });
});

test.afterAll(async () => {
  await closeChallenge(MONTH);
});

test('valida una actividad conforme con un clic', async ({ page }) => {
  await page.goto('/dashboard/admin/validations');
  const card = page.locator('.card').filter({ hasText: '10 abr 2025' });

  await expect(card).toContainText('Cumple FC', { ignoreCase: true });
  await expect(card).toContainText('30 min');

  await card.getByRole('button', { name: /Validar/ }).click();
  await expect(card).toHaveCount(0);
});

test('una actividad que no cumple la regla de FC exige nota de override', async ({ page }) => {
  await page.goto('/dashboard/admin/validations');
  const card = page.locator('.card').filter({ hasText: '11 abr 2025' });

  await expect(card).toContainText('No cumple FC', { ignoreCase: true });

  await card.getByRole('button', { name: /Validar/ }).click();
  const note = card.getByLabel('Nota de override');
  await expect(note).toBeVisible();

  const confirm = card.getByRole('button', { name: 'Validar con nota' });
  await expect(confirm).toBeDisabled();

  await note.fill('Registro histórico verificado en persona');
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(card).toHaveCount(0);

  const activities = await api<{ date: string; validationNote: string | null }[]>(
    'GET',
    '/activities?status=VALIDATED',
    { token: tokens().admin },
  );
  const stored = activities.body.find((a) => a.date.startsWith(NON_COMPLIANT_DATE));
  expect(stored?.validationNote).toBe('Registro histórico verificado en persona');
});

test('un error inesperado al validar muestra el código para soporte', async ({ page }) => {
  // El contrato del 500 genérico (spec platform-operations): el mensaje trae el requestId
  const requestId = 'pw-req-1';
  await page.route('**/api/activities/*/validate', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      headers: { 'X-Request-Id': requestId },
      body: JSON.stringify({
        statusCode: 500,
        message: `Ocurrió un error inesperado. Si el problema continúa, comparte este código con el administrador: ${requestId}`,
        requestId,
      }),
    }),
  );
  await page.goto('/dashboard/admin/validations');
  const card = page.locator('.card').filter({ hasText: '12 abr 2025' });
  await card.getByRole('button', { name: /Validar/ }).click();

  // Next.js agrega su propio anunciador con role=alert: se busca el del mensaje
  const alert = page.getByRole('alert').filter({ hasText: 'comparte este código' });
  await expect(alert).toContainText(requestId);
  await expect(alert).toContainText('comparte este código');
  await expect(card).toHaveCount(1);
  await page.unroute('**/api/activities/*/validate');
});
