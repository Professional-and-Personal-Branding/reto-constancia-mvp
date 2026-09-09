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
 * Recorridos 6 y 7 de docs/test-cases.md: varios retos activos y reglas de puntaje.
 * Casos cubiertos: TC-CHAL-08, TC-CHAL-10, TC-SCORE-05.
 */
const MONTH_A = 6;
const MONTH_B = 7;
const MONTH_SCORING = 8;

test.use({ storageState: STATE.admin });

test.beforeAll(async () => {
  const a = await setupChallenge({ month: MONTH_A, name: 'E2E Playwright · reto A' });
  const b = await setupChallenge({ month: MONTH_B, name: 'E2E Playwright · reto B' });
  const scoring = await setupChallenge({
    month: MONTH_SCORING,
    name: 'E2E Playwright · puntaje',
    budgetTotal: 900,
    pointsPerValidatedDay: 10,
    pointsPerKm: 1,
    minValidatedDaysToQualify: 5,
    maxWinners: 1,
    tiebreakRule: 'TOTAL_KM',
  });

  for (const challenge of [a, b, scoring]) {
    await enroll(challenge.id, tokens().participantId);
  }

  // Dos días validados: 2 x 10 + 10 km = 30 puntos, pero no llega al mínimo de 5 días
  for (const day of [10, 11]) {
    const activity = await createActivity(scoring.id, e2eDate(MONTH_SCORING, day), {
      distanceKm: 5,
    });
    await api('POST', `/activities/${activity.id}/validate`, { token: tokens().admin });
  }

  process.env.E2E_CHALLENGE_A = a.id;
  process.env.E2E_CHALLENGE_B = b.id;
  process.env.E2E_CHALLENGE_SCORING = scoring.id;
});

test.afterAll(async () => {
  for (const month of [MONTH_A, MONTH_B, MONTH_SCORING]) {
    await closeChallenge(month);
  }
});

test('con varios retos activos aparece el selector y la elección persiste', async ({ page }) => {
  await selectChallenge(page, process.env.E2E_CHALLENGE_A!);

  const selector = page.getByLabel('Reto activo seleccionado');
  await expect(selector).toBeVisible();
  await expect(page.locator('main')).toContainText('E2E Playwright · reto A');

  await selector.selectOption(process.env.E2E_CHALLENGE_B!);
  await expect(page.locator('main')).toContainText('E2E Playwright · reto B');

  await page.reload();
  await expect(page.locator('main')).toContainText('E2E Playwright · reto B');
});

test('el formulario de reto trae las reglas de puntaje con sus valores por defecto', async ({ page }) => {
  await page.goto('/dashboard/admin/challenges');
  await page.getByRole('button', { name: /Nuevo reto/ }).click();

  await expect(page.getByLabel('Puntos por día validado')).toHaveValue('1');
  await expect(page.getByLabel('Puntos por km')).toHaveValue('0');
  await expect(page.getByLabel('Mínimo de días para calificar')).toHaveValue('0');
  await expect(page.getByLabel('Máximo de ganadores')).toHaveValue('2');
  await expect(page.getByLabel('Regla de desempate')).toHaveValue('DRAW');
});

test('el ranking describe la regla, muestra puntos y marca a quien no califica', async ({ page }) => {
  await selectChallenge(page, process.env.E2E_CHALLENGE_SCORING!, '/dashboard/results');

  await expect(page.getByLabel('Regla de puntaje')).toContainText('10 por día validado');
  await expect(page.getByLabel('Regla de puntaje')).toContainText('mínimo 5 días');

  const table = page.locator('table');
  await expect(table.locator('thead')).toContainText('PUNTOS', { ignoreCase: true });

  const row = table.locator('tbody tr').first();
  await expect(row).toContainText('30');
  await expect(row).toContainText('no califica');
});

test('un reto con las reglas por defecto no muestra la columna de puntos', async ({ page }) => {
  await selectChallenge(page, process.env.E2E_CHALLENGE_A!, '/dashboard/results');

  await expect(page.getByLabel('Regla de puntaje')).toHaveCount(0);
  await expect(page.locator('table thead')).not.toContainText('PUNTOS', { ignoreCase: true });
});
