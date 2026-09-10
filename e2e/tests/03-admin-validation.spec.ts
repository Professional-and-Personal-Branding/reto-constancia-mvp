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
 * Casos cubiertos: TC-ACT-08, TC-ACT-09, TC-ACT-15.
 */
const MONTH = 4;
const COMPLIANT_DATE = e2eDate(MONTH, 10);
const NON_COMPLIANT_DATE = e2eDate(MONTH, 11);

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
