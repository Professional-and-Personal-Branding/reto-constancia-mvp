import { expect, test } from '@playwright/test';

import { api, E2E_YEAR, STATE, tokens } from '../fixtures/api';
import { selectChallenge } from '../fixtures/ui';

/**
 * Inscripción en bloque y renovación mensual (OpenSpec: monthly-challenge-renewal).
 * Casos cubiertos: TC-PART-09 (inscripción en bloque), TC-CHAL-24 (renovar desde la lista) y
 * TC-CHAL-25 (diálogo de renovar: teclado y reto sin participantes).
 *
 * Solo recorre lo que necesita el navegador; cada regla (inactivos, desconocidos, repetidos,
 * tope, reto cerrado, lock) se prueba en las pruebas de la API. Reutiliza la sesión guardada del
 * admin (sin logins nuevos). El mes de origen está en E2E_YEAR + 1 (9/2026): ningún otro spec ni
 * el seed (5/2026) lo usa; el mes siguiente (10/2026) lo crea la renovación. Los casos del reto sin
 * participantes usan 7/2026 y 8/2026. Todos se borran antes y después con `deleteTestChallenges`.
 * Sin esperas fijas: las respuestas retenidas se resuelven con una promesa del propio test.
 */
const YEAR = E2E_YEAR + 1;
const SOURCE_MONTH = 9;
const SOURCE_NAME = 'E2E Playwright · inscripción en bloque';
const TARGET_MONTH = SOURCE_MONTH + 1;
const TARGET_NAME = `Reto Octubre ${YEAR}`;
const EMPTY_MONTH = 7;
const EMPTY_NAME = 'E2E Playwright · sin participantes';
const EMPTY_TARGET_NAME = `Reto Agosto ${YEAR}`;

let sourceId = '';
let emptySourceId = '';

test.use({ storageState: STATE.admin });

async function resetMonths() {
  const { deleteTestChallenges } = await import('../../scripts/lib/test-db.mjs');
  await deleteTestChallenges([
    { month: SOURCE_MONTH, year: YEAR },
    { month: TARGET_MONTH, year: YEAR },
    { month: EMPTY_MONTH, year: YEAR },
    { month: EMPTY_MONTH + 1, year: YEAR },
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
  // El resumen financiero cuenta las dos inscripciones nuevas como impagas
  const summary = page.getByLabel('Resumen financiero');
  await expect(summary).toContainText('2 × 100');
  await expect(summary).toContainText('2 sin pagar');
  const enrolled = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Inscritos' }) });
  await expect(enrolled).toContainText('ana@reto.local');
  await expect(enrolled).toContainText('bruno@reto.local');
  // Ya no son candidatos y el botón vuelve a quedar sin selección
  await expect(page.getByLabel('Seleccionar a Ana Constante')).toHaveCount(0);
  await expect(bulk).toBeDisabled();

  // "Seleccionar todos" marca a todos los candidatos restantes
  await page.getByLabel('Seleccionar todos').check();
  const candidates = await page.locator('input[aria-label^="Seleccionar a "]').count();
  expect(candidates).toBeGreaterThan(0);
  await expect(bulk).toHaveText(`Inscribir seleccionados (${candidates})`);
  await expect(bulk).toBeEnabled();
});

test('el diálogo de renovar atrapa el foco, ignora Escape mientras crea y muestra el error del servidor', async ({
  page,
}) => {
  const conflict = `Ya existe un reto para 10/${YEAR}`;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/challenges/*/renew', async (route) => {
    await gate;
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ statusCode: 409, message: conflict }),
    });
  });

  await page.goto('/dashboard/admin/challenges');
  const sourceRow = page.getByLabel(`Reto ${SOURCE_NAME}`);
  const trigger = sourceRow.getByRole('button', { name: 'Renovar' });
  await trigger.click();

  const dialog = page.getByRole('dialog');
  const confirm = dialog.getByRole('button', { name: 'Crear borrador' });
  await expect(confirm).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();

  // La lista de retos queda inerte y oculta a tecnologías de asistencia
  const listHidden = await page.evaluate((label) => {
    const row = document.querySelector(`[aria-label="${label}"]`);
    let el: Element | null = row;
    while (el && el.parentElement !== document.body) el = el.parentElement;
    return !!el && el.hasAttribute('inert') && el.getAttribute('aria-hidden') === 'true';
  }, `Reto ${SOURCE_NAME}`);
  expect(listHidden).toBe(true);

  // Tab recorre el diálogo y da la vuelta sin salir; Shift+Tab desde el primero va al último
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    await expect(dialog.locator(':focus')).toHaveCount(1);
  }
  const nameInput = dialog.getByLabel('Nombre del reto nuevo');
  await nameInput.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(confirm).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(nameInput).toBeFocused();

  // Confirmar con el servidor retenido: "Creando…", foco en el diálogo y Escape no cierra
  await confirm.click();
  await expect(dialog.getByRole('button', { name: 'Creando…' })).toBeDisabled();
  await expect(dialog).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog.getByRole('button', { name: 'Creando…' })).toBeVisible();

  // Respuesta 409: el error se muestra dentro del diálogo y la lista no cambia
  release();
  await expect(dialog.getByRole('alert').filter({ hasText: conflict })).toBeVisible();
  await expect(page.getByLabel(`Reto ${TARGET_NAME}`)).toHaveCount(0);

  // El foco estaba en el diálogo: Tab cae en el primer control habilitado
  await page.keyboard.press('Tab');
  await expect(nameInput).toBeFocused();

  // Escape cierra y el foco vuelve al botón que abrió el diálogo
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.unroute('**/api/challenges/*/renew');
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

test('lista como omitido a un candidato desactivado después de cargar la página', async ({ page }) => {
  const { admin } = tokens();
  const email = `bulk-${Date.now()}@e2e.local`;
  const reg = await api('POST', '/auth/register', {
    body: { name: 'Bulk Desechable', email, password: 'Desechable123' },
  });
  expect(reg.status).toBe(201);
  const users = await api<{ id: string; email: string }[]>('GET', '/users', { token: admin });
  const throwawayId = users.body.find((u) => u.email === email)!.id;

  await selectChallenge(page, sourceId, '/dashboard/admin/participants');
  const throwaway = page.getByLabel('Seleccionar a Bulk Desechable');
  await expect(throwaway).toBeVisible();
  const seed = page.locator('input[aria-label^="Seleccionar a "]:not([aria-label$="Bulk Desechable"])').first();
  const seedLabel = (await seed.getAttribute('aria-label'))!.replace('Seleccionar a ', '');

  // Se desactiva con la página ya cargada: sigue apareciendo como candidato
  const off = await api('PATCH', `/users/${throwawayId}`, { token: admin, body: { active: false } });
  expect(off.status).toBe(200);

  await throwaway.check();
  await seed.check();
  const bulk = page.getByRole('button', { name: /^Inscribir seleccionados/ });
  await expect(bulk).toHaveText('Inscribir seleccionados (2)');
  await bulk.click();

  const status = page.getByRole('status').filter({ hasText: 'Bulk Desechable (usuario inactivo)' });
  await expect(status).toContainText('1 inscrito');
  await expect(status).toContainText('1 omitido');
  const enrolled = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Inscritos' }) });
  await expect(enrolled).toContainText(seedLabel);
  await expect(enrolled).not.toContainText('Bulk Desechable');
});

test('renovar un reto sin participantes activos crea el borrador con 0 inscritos', async ({ page }) => {
  const { admin } = tokens();
  const created = await api<{ id: string }>('POST', '/challenges', {
    token: admin,
    body: {
      name: EMPTY_NAME,
      month: EMPTY_MONTH,
      year: YEAR,
      startDate: `${YEAR}-0${EMPTY_MONTH}-01T00:00:00.000Z`,
      endDate: `${YEAR}-0${EMPTY_MONTH}-28T23:59:59.000Z`,
      validDays: [0, 1, 2, 3, 4, 5, 6],
      minHeartRateMinutes: 0,
      feePerParticipant: 100,
      currency: 'BOB',
    },
  });
  expect(created.status).toBe(201);
  emptySourceId = created.body.id;
  expect((await api('POST', `/challenges/${emptySourceId}/activate`, { token: admin })).status).toBe(201);

  await page.goto('/dashboard/admin/challenges');
  await page.getByLabel(`Reto ${EMPTY_NAME}`).getByRole('button', { name: 'Renovar' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(`${EMPTY_NAME} no tiene participantes activos para inscribir.`);
  await expect(dialog.getByRole('checkbox')).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Crear borrador' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('status').filter({ hasText: `${EMPTY_TARGET_NAME} creado en borrador con 0 inscritos` }),
  ).toBeVisible();
  await expect(page.getByLabel(`Reto ${EMPTY_TARGET_NAME}`)).toContainText('0 participantes');
});

test('con un solo participante activo la casilla habla en singular', async ({ page }) => {
  const { admin, participantId } = tokens();
  const enrol = await api('POST', `/challenges/${emptySourceId}/participants`, {
    token: admin,
    body: { userId: participantId },
  });
  expect(enrol.status).toBe(201);

  await page.goto('/dashboard/admin/challenges');
  await page.getByLabel(`Reto ${EMPTY_NAME}`).getByRole('button', { name: 'Renovar' }).click();
  const dialog = page.getByRole('dialog');
  const copy = dialog.getByLabel(`Inscribir al participante activo de ${EMPTY_NAME}`);
  await expect(copy).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
