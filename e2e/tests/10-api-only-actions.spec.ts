import { expect, Page, test } from '@playwright/test';

import {
  api,
  closeChallenge,
  createActivity,
  e2eDate,
  enroll,
  markPaid,
  setupChallenge,
  STATE,
  tokens,
} from '../fixtures/api';
import { selectChallenge } from '../fixtures/ui';

/**
 * Acciones que antes solo existían por API (spec web-api-only-actions): editar un reto,
 * retirar una actividad pendiente y registrar un pago parcial.
 * Casos cubiertos: TC-CHAL-05, TC-ACT-12, TC-FIN-01.
 */
const MONTH = 1;
const CLOSED_MONTH = 2;
const NAME = 'E2E Playwright · acciones';
const CLOSED_NAME = 'E2E Playwright · cerrado sin edición';

let challengeId = '';

test.beforeAll(async () => {
  const challenge = await setupChallenge({ month: MONTH, name: NAME, feePerParticipant: 120, budgetTotal: 600 });
  challengeId = challenge.id;
  await enroll(challengeId, tokens().participantId);
  await markPaid(challengeId, tokens().participantId, false);
  // Un reto cerrado para comprobar que no ofrece edición
  await setupChallenge({ month: CLOSED_MONTH, name: CLOSED_NAME });
  await closeChallenge(CLOSED_MONTH);
});

test.afterAll(async () => {
  await closeChallenge(MONTH);
});

const card = (page: Page, name: string) => page.getByLabel(`Reto ${name}`, { exact: true });

test.describe('Administrador', () => {
  test.use({ storageState: STATE.admin });

  test('edita un reto activo desde la web y un reto cerrado no ofrece edición', async ({ page }) => {
    await page.goto('/dashboard/admin/challenges');
    await expect(card(page, CLOSED_NAME)).toBeVisible();
    await expect(card(page, CLOSED_NAME).getByRole('button', { name: 'Editar' })).toHaveCount(0);

    await card(page, NAME).getByRole('button', { name: 'Editar' }).click();
    const form = page.getByRole('form', { name: `Editar ${NAME}` });
    await expect(form).toContainText('El reto está activo');
    await expect(form.getByLabel('Cuota / persona')).toHaveValue('120');
    await form.getByLabel('Cuota / persona').fill('150');
    await form.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(form).toHaveCount(0);

    const read = await api<{ feePerParticipant: string; status: string; name: string }>('GET', `/challenges/${challengeId}`, { token: tokens().admin });
    expect(Number(read.body.feePerParticipant)).toBe(150);
    expect(read.body.status).toBe('ACTIVE');
    expect(read.body.name).toBe(NAME);
  });

  test('un período con el fin antes del inicio muestra el error de la API y no cambia nada', async ({ page }) => {
    await page.goto('/dashboard/admin/challenges');
    await card(page, NAME).getByRole('button', { name: 'Editar' }).click();
    const form = page.getByRole('form', { name: `Editar ${NAME}` });
    await form.getByLabel('Fin').fill(`2024-12-15`);
    await form.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(form.getByRole('alert')).toContainText('startDate debe ser menor que endDate');

    const read = await api<{ endDate: string }>('GET', `/challenges/${challengeId}`, { token: tokens().admin });
    expect(read.body.endDate.slice(0, 10)).toBe(e2eDate(MONTH, 28));
  });

  test('registra un pago parcial, el pago completo por defecto y rechaza un monto cero', async ({ page }) => {
    await markPaid(challengeId, tokens().participantId, false);
    await selectChallenge(page, challengeId, '/dashboard/admin/participants');
    const row = page.getByLabel('Participante Ana Constante');
    const summary = page.getByLabel('Resumen financiero');

    // Parcial: 60 de una cuota de 150 (la edición anterior la subió)
    await row.getByRole('button', { name: 'Marcar pagado' }).click();
    await expect(row.getByLabel('Monto recibido')).toHaveValue('150');
    await row.getByLabel('Monto recibido').fill('60');
    await row.getByRole('button', { name: 'Guardar pago' }).click();
    await expect(row).toContainText('Parcial 60');
    await expect(row).toContainText('debe 90');
    await expect(summary).toContainText('60 BOB');

    // Pago completo con el monto que viene por defecto
    await row.getByRole('button', { name: 'Marcar impago' }).click();
    await row.getByRole('button', { name: 'Marcar pagado' }).click();
    await row.getByRole('button', { name: 'Guardar pago' }).click();
    await expect(row).toContainText('Pagado 150');

    // Cero no se guarda
    await row.getByRole('button', { name: 'Marcar impago' }).click();
    await row.getByRole('button', { name: 'Marcar pagado' }).click();
    await row.getByLabel('Monto recibido').fill('0');
    await row.getByRole('button', { name: 'Guardar pago' }).click();
    await expect(row.getByRole('alert')).toContainText('mayor que cero');
    await expect(row).toContainText('Debe 150');
  });
});

test.describe('Participante', () => {
  test.use({ storageState: STATE.participant });

  test('retira una actividad pendiente con confirmación y el día queda libre otra vez', async ({ page }) => {
    // El navegador cree que hoy es el 6 de enero de 2025, dentro del reto de prueba
    const today = e2eDate(MONTH, 6);
    await page.clock.setFixedTime(new Date(`${today}T12:00:00`));
    const activity = await createActivity(challengeId, today, { distanceKm: 5 });
    await selectChallenge(page, challengeId, '/dashboard');

    const list = page.getByLabel('Mis actividades');
    const pendingStat = page.locator('.card').filter({ hasText: /^Pendientes/ });
    await expect(page.getByText('Hoy ya está')).toBeVisible();
    await expect(pendingStat).toContainText('1');

    // Cancelar no borra nada
    await list.getByRole('button', { name: 'Retirar' }).click();
    await page.getByRole('button', { name: 'No' }).click();
    await expect(list.getByRole('button', { name: 'Retirar' })).toBeVisible();

    await list.getByRole('button', { name: 'Retirar' }).click();
    await page.getByRole('button', { name: 'Sí, retirar' }).click();
    await expect(page.getByText('Aún no has registrado ninguna actividad.')).toBeVisible();
    await expect(pendingStat).toContainText('0');
    await expect(page.getByRole('link', { name: 'Subir actividad de hoy' })).toBeVisible();

    const gone = await api('GET', `/activities/me?challengeId=${challengeId}`, { token: tokens().participant });
    expect((gone.body as { id: string }[]).some((a) => a.id === activity.id)).toBe(false);
  });

  test('las actividades validadas o rechazadas no ofrecen retirar', async ({ page }) => {
    const activity = await createActivity(challengeId, e2eDate(MONTH, 7), { distanceKm: 4 });
    await api('POST', `/activities/${activity.id}/validate`, { token: tokens().admin });
    await selectChallenge(page, challengeId, '/dashboard');
    const list = page.getByLabel('Mis actividades');
    await expect(list).toContainText('Validado');
    await expect(list.getByRole('button', { name: 'Retirar' })).toHaveCount(0);
  });
});
