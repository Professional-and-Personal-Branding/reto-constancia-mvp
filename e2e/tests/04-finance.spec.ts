import { expect, test } from '@playwright/test';

import { closeChallenge, enroll, markPaid, setupChallenge, STATE, tokens, uploadPaymentProof } from '../fixtures/api';
import { selectChallenge } from '../fixtures/ui';

/**
 * Recorrido 5 de docs/test-cases.md: pagos y resumen financiero.
 * Casos cubiertos: TC-PART-04, TC-FIN-01, TC-FIN-02, TC-FIN-05, TC-FIN-09.
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

test('la cola de comprobantes: por revisar, filtro, pago completo y pago parcial', async ({ page }) => {
  const challengeId = process.env.E2E_FINANCE_CHALLENGE!;
  const { participantId } = tokens();
  // Punto de partida limpio: sin pago registrado y con un comprobante subido por el participante
  await markPaid(challengeId, participantId, false);
  await uploadPaymentProof(challengeId, 'cola-uno');

  await selectChallenge(page, challengeId, '/dashboard/admin/participants');
  const summary = page.getByLabel('Resumen financiero');
  const card = summary.getByRole('button', { name: 'Comprobantes por revisar: 1' });
  await expect(card).toContainText('Por revisar');
  const filters = page.getByRole('group', { name: 'Filtrar inscritos' });
  await expect(filters.getByRole('button', { name: 'Por revisar (1)' })).toBeVisible();
  await expect(filters.getByRole('button', { name: 'Todos (1)' })).toBeVisible();

  // La tarjeta selecciona el filtro y la fila muestra la insignia con la fecha
  await card.click();
  await expect(filters.getByRole('button', { name: 'Por revisar (1)' })).toHaveAttribute('aria-pressed', 'true');
  const row = page.locator('.card').filter({ hasText: 'ana@reto.local' });
  await expect(row).toContainText('Comprobante por revisar · subido el');
  await expect(row).toContainText('Ver comprobante de pago');

  // Registrar el pago completo la saca de la cola y la pasa a Pagados
  await page.getByRole('button', { name: 'Marcar pagado' }).first().click();
  await page.getByRole('button', { name: 'Guardar pago' }).click();
  await expect(summary.getByRole('button', { name: 'Comprobantes por revisar: 0' })).toBeVisible();
  await expect(filters.getByRole('button', { name: 'Pagados (1)' })).toBeVisible();
  await expect(page.getByText('Nadie en este filtro.')).toBeVisible();
  await filters.getByRole('button', { name: 'Pagados (1)' }).click();
  await expect(row).toContainText('Pagado');
  await expect(row).not.toContainText('Comprobante por revisar');

  // Un pago parcial también saca el comprobante de la cola y mueve la fila a Parciales
  await markPaid(challengeId, participantId, false);
  await page.reload();
  await expect(summary.getByRole('button', { name: 'Comprobantes por revisar: 1' })).toBeVisible();
  await filters.getByRole('button', { name: 'Por revisar (1)' }).click();
  await page.getByRole('button', { name: 'Marcar pagado' }).first().click();
  await page.getByLabel('Monto recibido').fill('60');
  await page.getByRole('button', { name: 'Guardar pago' }).click();
  await expect(summary.getByRole('button', { name: 'Comprobantes por revisar: 0' })).toBeVisible();
  await expect(filters.getByRole('button', { name: 'Parciales (1)' })).toBeVisible();
  await filters.getByRole('button', { name: 'Parciales (1)' }).click();
  await expect(row).toContainText(/Parcial 60(\.00)? BOB · debe 60 BOB/);

  // Dejar el reto sin pagos para no afectar a otras pruebas
  await markPaid(challengeId, participantId, false);
});
