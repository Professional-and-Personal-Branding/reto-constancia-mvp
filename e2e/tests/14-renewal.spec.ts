import { expect, test } from '@playwright/test';

import { api, E2E_YEAR, STATE, tokens } from '../fixtures/api';
import { selectChallenge } from '../fixtures/ui';

/**
 * Inscripción en bloque y renovación mensual (OpenSpec: monthly-challenge-renewal).
 * Casos cubiertos: TC-PART-09 (inscripción en bloque) y TC-CHAL-24 (renovar desde la lista).
 *
 * Solo recorre lo que necesita el navegador; cada regla (inactivos, desconocidos, repetidos,
 * tope, reto cerrado, lock) se prueba en las pruebas de la API. Reutiliza la sesión guardada del
 * admin (sin logins nuevos). El mes de origen está en E2E_YEAR + 1 (9/2026): ningún otro spec ni
 * el seed (5/2026) lo usa; el mes siguiente (10/2026) lo crea la renovación. Ambos se borran antes y
 * después con `deleteTestChallenges`.
 */
const YEAR = E2E_YEAR + 1;
const SOURCE_MONTH = 9;
const SOURCE_NAME = 'E2E Playwright · inscripción en bloque';
const TARGET_MONTH = SOURCE_MONTH + 1;
const TARGET_NAME = `Reto Octubre ${YEAR}`;

let sourceId = '';

test.use({ storageState: STATE.admin });

async function resetMonths() {
  const { deleteTestChallenges } = await import('../../scripts/lib/test-db.mjs');
  await deleteTestChallenges([
    { month: SOURCE_MONTH, year: YEAR },
    { month: TARGET_MONTH, year: YEAR },
  ]);
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

test('renueva el reto en el mes siguiente con sus participantes y avisa si el mes ya existe', async ({ page }) => {
  // Datos propios del recorrido: Ana y Bruno inscritos en el origen (idempotente)
  const { admin } = tokens();
  const users = await api<{ id: string; email: string }[]>('GET', '/users', { token: admin });
  const idOf = (email: string) => users.body.find((u) => u.email === email)!.id;
  await api('POST', `/challenges/${sourceId}/participants/bulk`, {
    token: admin,
    body: { userIds: [idOf('ana@reto.local'), idOf('bruno@reto.local')] },
  });

  await page.goto('/dashboard/admin/challenges');
  const sourceRow = page.getByLabel(`Reto ${SOURCE_NAME}`);
  await sourceRow.getByRole('button', { name: 'Renovar' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(`Se creará ${TARGET_NAME} en borrador`);
  await expect(dialog).toContainText(`Octubre ${YEAR}`);
  await expect(dialog).toContainText(`${YEAR}-10-01`);
  await expect(dialog).toContainText(`${YEAR}-10-31`);
  await expect(dialog).toContainText('No se copian pagos, comprobantes, actividades ni premiaciones');
  const copy = dialog.getByLabel(/^Inscribir a los 2 participantes activos de/);
  await expect(copy).toBeChecked();
  await dialog.getByText('Ver quiénes se inscriben').click();
  await expect(dialog).toContainText('Ana Constante');
  await expect(dialog).toContainText('Bruno Kilometros');
  await expect(dialog.getByLabel('Nombre del reto nuevo')).toHaveValue(TARGET_NAME);

  await dialog.getByRole('button', { name: 'Crear borrador' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('status').filter({ hasText: `${TARGET_NAME} creado en borrador con 2 inscritos` }),
  ).toBeVisible();
  const newRow = page.getByLabel(`Reto ${TARGET_NAME}`);
  await expect(newRow).toContainText('Borrador');
  await expect(newRow).toContainText('2 participantes');
  // Un borrador no ofrece "Renovar"
  await expect(newRow.getByRole('button', { name: 'Renovar' })).toHaveCount(0);
  await expect(newRow.getByRole('button', { name: 'Activar' })).toBeVisible();

  // Segundo intento: el mes ya existe y no se puede confirmar
  await sourceRow.getByRole('button', { name: 'Renovar' }).click();
  await expect(dialog).toContainText(`Ya existe un reto para Octubre ${YEAR} (borrador)`);
  await expect(dialog.getByRole('button', { name: 'Crear borrador' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
