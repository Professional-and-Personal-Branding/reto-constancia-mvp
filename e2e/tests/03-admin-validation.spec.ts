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
 * Casos cubiertos: TC-ACT-08, TC-ACT-09, TC-ACT-15, TC-UI-11, TC-UI-13.
 */
const MONTH = 4;
const COMPLIANT_DATE = e2eDate(MONTH, 10);
const NON_COMPLIANT_DATE = e2eDate(MONTH, 11);
const ERROR_DATE = e2eDate(MONTH, 12);
// Segundo reto activo para la cola filtrada (TC-UI-13)
const QUEUE_MONTH = 7;
const QUEUE_NAME = 'E2E Playwright · cola';

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

  const queue = await setupChallenge({ month: QUEUE_MONTH, name: QUEUE_NAME, minHeartRateMinutes: 0 });
  await enroll(queue.id, tokens().participantId);
  await createActivity(queue.id, e2eDate(QUEUE_MONTH, 20), {});
  await createActivity(queue.id, e2eDate(QUEUE_MONTH, 5), {});
});

test.afterAll(async () => {
  await closeChallenge(MONTH);
  await closeChallenge(QUEUE_MONTH);
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

test('la cola filtra por reto, ordena de la más antigua y el menú muestra el contador', async ({ page }) => {
  const countNow = async () =>
    (await api<{ count: number }>('GET', '/activities/pending/count', { token: tokens().admin })).body.count;
  const badge = page.getByTestId('pending-badge');
  const cards = page.locator('.card');

  await page.goto('/dashboard/admin/validations');
  // Sin reto elegido: todos, la más antigua primero (abril antes que julio)
  await expect(cards.first()).toContainText('abr 2025');
  await expect(cards.filter({ hasText: QUEUE_NAME })).toHaveCount(2);

  const before = await countNow();
  expect(before).toBeGreaterThanOrEqual(3);
  await expect(badge).toHaveText(before > 99 ? '99+' : String(before));

  // Un reto: solo sus dos actividades, 5 antes que 20
  await page.getByLabel('Filtrar por reto').selectOption({ label: QUEUE_NAME });
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText('5 jul 2025');
  await expect(cards.first()).toContainText(QUEUE_NAME);
  await expect(page.getByText('2 actividades pendientes de revisión.')).toBeVisible();

  // Orden invertido, guardado en la URL: sobrevive a una recarga
  await page.getByLabel('Orden de la cola').selectOption({ label: 'Más nuevas primero' });
  await expect(cards.first()).toContainText('20 jul 2025');
  await expect(page).toHaveURL(/orden=desc/);
  await expect(page).toHaveURL(/reto=/);
  await page.reload();
  await expect(page.getByLabel('Filtrar por reto')).toHaveValue(/.+/);
  await expect(cards.first()).toContainText('20 jul 2025');

  // Validar una baja el contador del menú sin recargar
  await cards.first().getByRole('button', { name: /Validar/ }).click();
  await expect(cards).toHaveCount(1);
  await expect(badge).toHaveText(String(before - 1));
});
