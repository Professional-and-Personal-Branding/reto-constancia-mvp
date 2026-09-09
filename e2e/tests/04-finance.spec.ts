import { expect, test } from '@playwright/test';

import { closeChallenge, enroll, setupChallenge, STATE, tokens } from '../fixtures/api';
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
    budgetTotal: 600,
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

  await expect(summary).toContainText('1 pagados');
  await expect(row).toContainText('Pagado');
  await expect(summary).toContainText('Faltan 480 BOB'); // 600 de presupuesto - 120 recaudados

  await page.getByRole('button', { name: 'Marcar impago' }).first().click();
  await expect(summary).toContainText('1 sin pagar');
  await expect(row).toContainText('Debe 120 BOB');
});

test('el ranking muestra el premio por ganador', async ({ page }) => {
  await selectChallenge(page, process.env.E2E_FINANCE_CHALLENGE!, '/dashboard/results');

  const payout = page.getByLabel('Premio por ganador');
  await expect(payout).toContainText('600 BOB');
});
