import { expect, test } from '@playwright/test';

import { api, closeChallenge, createActivity, e2eDate, enroll, setupChallenge, STATE, tokens } from '../fixtures/api';
import { selectChallenge } from '../fixtures/ui';

/**
 * "Mi avance" del panel (spec participant-calendar): cuántos días validados faltan para el mínimo
 * y, al alcanzarlo, que se confirma al cierre.
 * Casos cubiertos: TC-ACT-25.
 *
 * Reutiliza la sesión guardada del participante (sin logins nuevos) y fija el reloj del navegador
 * dentro del período. El mes 6 de E2E_YEAR no lo usa ningún otro recorrido.
 */
const MONTH = 6;
const NAME = 'E2E Playwright · mi avance';

let challengeId = '';
let pendingId = '';

test.use({ storageState: STATE.participant });

test.beforeAll(async () => {
  const challenge = await setupChallenge({ month: MONTH, name: NAME, minValidatedDaysToQualify: 3 });
  challengeId = challenge.id;
  await enroll(challengeId, tokens().participantId);

  const admin = tokens().admin;
  const validated = await createActivity(challengeId, e2eDate(MONTH, 2));
  await api('POST', `/activities/${validated.id}/validate`, { token: admin });
  pendingId = (await createActivity(challengeId, e2eDate(MONTH, 3))).id;
});

test.afterAll(async () => {
  await closeChallenge(MONTH);
});

test('Mi avance muestra lo que falta para el mínimo y luego que ya se alcanza', async ({ page }) => {
  await page.clock.setFixedTime(new Date(`${e2eDate(MONTH, 10)}T12:00:00`));
  await selectChallenge(page, challengeId, '/dashboard');

  const card = page.getByRole('region', { name: 'Mi avance' });
  await expect(card.getByText('Validados: 1 de 3')).toBeVisible();
  await expect(card.getByText('Te faltan 2 días validados para el mínimo; aún puedes llegar.')).toBeVisible();
  await expect(
    card.getByText(/Tienes 1 pendiente de validar y \d+ días válidos sin registrar en el período\./),
  ).toBeVisible();
  const bar = card.getByRole('progressbar', { name: 'Días validados para el mínimo' });
  await expect(bar).toHaveAttribute('aria-valuenow', '1');
  await expect(bar).toHaveAttribute('aria-valuemax', '3');

  // El admin valida la pendiente y se registra y valida un día más: se alcanza el mínimo
  const admin = tokens().admin;
  await api('POST', `/activities/${pendingId}/validate`, { token: admin });
  const extra = await createActivity(challengeId, e2eDate(MONTH, 4));
  await api('POST', `/activities/${extra.id}/validate`, { token: admin });

  await page.reload();
  await expect(card.getByText('Validados: 3 de 3')).toBeVisible();
  await expect(card.getByText('Ya alcanzas el mínimo; se confirma al cierre.')).toBeVisible();
  await expect(bar).toHaveAttribute('aria-valuenow', '3');
  await expect(card.getByText(/Te faltan/)).toHaveCount(0);
});
