import { expect, test } from '@playwright/test';

import { api, E2E_YEAR, STATE, tokens } from '../fixtures/api';
import { selectChallenge } from '../fixtures/ui';

/**
 * Inscripción en bloque y renovación mensual (OpenSpec: monthly-challenge-renewal).
 * Casos cubiertos: TC-PART-09.
 *
 * Solo recorre lo que necesita el navegador; cada regla (inactivos, desconocidos, repetidos,
 * tope, reto cerrado, lock) se prueba en las pruebas de la API. Reutiliza la sesión guardada del
 * admin (sin logins nuevos). El mes de origen está en E2E_YEAR + 1 (9/2026): ningún otro spec ni
 * el seed (5/2026) lo usa. Se borra antes y después con `deleteTestChallenges`.
 */
const YEAR = E2E_YEAR + 1;
const SOURCE_MONTH = 9;
const SOURCE_NAME = 'E2E Playwright · inscripción en bloque';

let sourceId = '';

test.use({ storageState: STATE.admin });

async function resetMonths() {
  const { deleteTestChallenges } = await import('../../scripts/lib/test-db.mjs');
  await deleteTestChallenges([{ month: SOURCE_MONTH, year: YEAR }]);
}

test.beforeAll(async () => {
  await resetMonths();
  const { admin } = tokens();
  const created = await api<{ id: string }>('POST', '/challenges', {
    token: admin,
    body: {
      name: SOURCE_NAME,
      month: SOURCE_MONTH,
      year: YEAR,
      startDate: `${YEAR}-${String(SOURCE_MONTH).padStart(2, '0')}-01T00:00:00.000Z`,
      endDate: `${YEAR}-${String(SOURCE_MONTH).padStart(2, '0')}-28T23:59:59.000Z`,
      validDays: [0, 1, 2, 3, 4, 5, 6],
      minHeartRateMinutes: 0,
      feePerParticipant: 100,
      currency: 'BOB',
    },
  });
  if (created.status !== 201) {
    throw new Error(`No se pudo crear el reto: ${created.status} ${JSON.stringify(created.body)}`);
  }
  sourceId = created.body.id;
  await api('POST', `/challenges/${sourceId}/activate`, { token: admin });
});

test.afterAll(async () => {
  await resetMonths();
});

test('inscribe a varios participantes de una vez y muestra el resultado', async ({ page }) => {
  await selectChallenge(page, sourceId, '/dashboard/admin/participants');

  const bulk = page.getByRole('button', { name: /^Inscribir seleccionados/ });
  await expect(bulk).toBeDisabled();
  await expect(bulk).toHaveText('Inscribir seleccionados (0)');

  await page.getByLabel('Seleccionar a Ana Constante').check();
  await page.getByLabel('Seleccionar a Bruno Kilometros').check();
  await expect(bulk).toHaveText('Inscribir seleccionados (2)');
  await bulk.click();

  await expect(page.getByRole('status').filter({ hasText: '2 inscritos' })).toBeVisible();
  const enrolled = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Inscritos' }) });
  await expect(enrolled).toContainText('ana@reto.local');
  await expect(enrolled).toContainText('bruno@reto.local');
  // Ya no son candidatos y el botón vuelve a quedar sin selección
  await expect(page.getByLabel('Seleccionar a Ana Constante')).toHaveCount(0);
  await expect(bulk).toBeDisabled();

  // "Seleccionar todos" marca a todos los candidatos restantes
  await page.getByLabel('Seleccionar todos').check();
  await expect(bulk).not.toHaveText('Inscribir seleccionados (0)');
  await expect(bulk).toBeEnabled();
});
