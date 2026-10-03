import { expect, test } from '@playwright/test';

import { closeChallenge, enroll, markPaid, setupChallenge, STATE, tokens } from '../fixtures/api';
import { selectChallenge } from '../fixtures/ui';

/**
 * Recorrido 5 de docs/test-cases.md: pagos y resumen financiero.
 * Casos cubiertos: TC-PART-04, TC-FIN-01, TC-FIN-02, TC-FIN-05.
 */
const MONTH = 5;

test.use({ storageState: STATE.admin });

test.beforeAll(async () => {
  const challenge = await setupChallenge({
    month: MONTH,
    name: 'E2E Playwright · finanzas',
    feePerParticipant: 120,
  });
  await enroll(challenge.id, tokens().participantId);
  process.env.E2E_FINANCE_CHALLENGE = challenge.id;
});

test.afterAll(async () => {
  await closeChallenge(MONTH);
});

test('el resumen financiero refleja los pagos al instante', async ({ page }) => {
  await selectChallenge(page, process.env.E2E_FINANCE_CHALLENGE!, '/dashboard/admin/participants');

  const summary = page.getByLabel('Resumen financiero');
  await expect(summary).toContainText('120 BOB'); // esperado: 1 inscrito x 120
  await expect(summary).toContainText('Pendiente', { ignoreCase: true });

  const row = page.locator('.card').filter({ hasText: 'ana@reto.local' });
  await expect(row).toContainText('Debe 120 BOB');

  await page.getByRole('button', { name: 'Marcar pagado' }).first().click();
  // El monto viene con la cuota: guardarlo sin cambiarlo es el pago completo
  await expect(page.getByLabel('Monto recibido')).toHaveValue('120');
  await page.getByRole('button', { name: 'Guardar pago' }).click();

  await expect(summary).toContainText('1 pagados');
  await expect(row).toContainText('Pagado');
  // Presupuesto automático: 1 inscrito × 120, cubierto con el pago
  await expect(summary).toContainText('Cubierto');
  await expect(summary).toContainText('120 BOB · automático');

  await page.getByRole('button', { name: 'Marcar impago' }).first().click();
  await expect(summary).toContainText('1 sin pagar');
  await expect(row).toContainText('Debe 120 BOB');
});

test('el ranking muestra el premio por ganador', async ({ page }) => {
  const challengeId = process.env.E2E_FINANCE_CHALLENGE!;
  // Sin pagos, el pote (lo recaudado) es 0
  await markPaid(challengeId, tokens().participantId, false);
  await selectChallenge(page, challengeId, '/dashboard/results');
  const payout = page.getByLabel('Premio por ganador');
  await expect(payout).toContainText('aún no hay pagos registrados');

  // Con la cuota pagada, el pote es lo recaudado y no el presupuesto
  await markPaid(challengeId, tokens().participantId, true);
  await page.reload();
  await expect(payout).toContainText('120 BOB recaudado');
  await expect(payout).toContainText('proyectado');
});

test('el presupuesto es automático y se puede fijar a mano y volver a automático', async ({ page }) => {
  const challengeId = process.env.E2E_FINANCE_CHALLENGE!;
  const name = 'E2E Playwright · finanzas';
  const summary = page.getByLabel('Resumen financiero');
  const editForm = page.getByRole('form', { name: `Editar ${name}` });

  await page.goto('/dashboard/admin/challenges');
  await page.getByLabel(`Reto ${name}`, { exact: true }).getByRole('button', { name: 'Editar' }).click();
  await expect(editForm.getByLabel('Presupuesto automático (cuota × inscritos)')).toBeChecked();
  await editForm.getByLabel('Presupuesto automático (cuota × inscritos)').uncheck();
  await editForm.getByLabel('Presupuesto fijado').fill('800');
  await editForm.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(editForm).toHaveCount(0);
  await selectChallenge(page, challengeId, '/dashboard/admin/participants');
  await expect(summary).toContainText('800 BOB · ajustado');

  await page.goto('/dashboard/admin/challenges');
  await page.getByLabel(`Reto ${name}`, { exact: true }).getByRole('button', { name: 'Editar' }).click();
  await editForm.getByLabel('Presupuesto automático (cuota × inscritos)').check();
  await editForm.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(editForm).toHaveCount(0);
  await selectChallenge(page, challengeId, '/dashboard/admin/participants');
  await expect(summary).toContainText('120 BOB · automático');
});
