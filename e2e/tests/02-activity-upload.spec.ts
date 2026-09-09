import { expect, test } from '@playwright/test';

import { closeChallenge, e2eDate, enroll, setupChallenge, STATE, tokens } from '../fixtures/api';
import { pngFile, selectChallenge } from '../fixtures/ui';

/**
 * Recorrido 3 de docs/test-cases.md: registrar una actividad con la regla de FC.
 * Casos cubiertos: TC-ACT-01, TC-ACT-02, TC-ACT-05, TC-ACT-13, TC-ACT-14, TC-ACT-18, TC-UP-02.
 *
 * Es el único lugar donde se ejercita la subida real de archivos de punta a punta:
 * formulario → /upload/sign → simulador local → registro de la actividad.
 */
const MONTH = 3;
const DATE = e2eDate(MONTH, 10);

test.use({ storageState: STATE.participant });

test.beforeAll(async () => {
  const challenge = await setupChallenge({
    month: MONTH,
    name: 'E2E Playwright · subida',
    minHeartRateMinutes: 20,
  });
  await enroll(challenge.id, tokens().participantId);
  process.env.E2E_UPLOAD_CHALLENGE = challenge.id;
});

test.afterAll(async () => {
  await closeChallenge(MONTH);
});

test('el formulario guía y bloquea hasta cumplir la regla de FC', async ({ page }) => {
  await selectChallenge(page, process.env.E2E_UPLOAD_CHALLENGE!, '/dashboard/upload');

  await expect(page.locator('main')).toContainText('al menos 20 min de registro');

  const submit = page.getByRole('button', { name: /Registrar actividad/ });
  const warning = page.locator('[role="status"]');

  await page.getByLabel('Fecha').fill(DATE);
  await page.getByLabel('Duración (min)').fill('40');
  await page.getByLabel('Minutos con FC').fill('15');
  await expect(warning).toContainText('20');
  await expect(submit).toBeDisabled();

  await page.getByLabel('Minutos con FC').fill('25');
  await expect(warning).toContainText(/captura/i);
  await expect(submit).toBeDisabled();

  const inputs = page.locator('input[type="file"]');
  await inputs.nth(0).setInputFiles(pngFile('entrenamiento.png'));
  await inputs.nth(1).setInputFiles(pngFile('frecuencia.png'));

  await expect(warning).toHaveCount(0);
  await expect(submit).toBeEnabled();
});

test('registra la actividad y la muestra con su fecha exacta', async ({ page }) => {
  await selectChallenge(page, process.env.E2E_UPLOAD_CHALLENGE!, '/dashboard/upload');

  await page.getByLabel('Fecha').fill(DATE);
  await page.getByLabel('Duración (min)').fill('40');
  await page.getByLabel('Distancia (km, opcional)').fill('6.5');
  await page.getByLabel('Minutos con FC').fill('30');
  const inputs = page.locator('input[type="file"]');
  await inputs.nth(0).setInputFiles(pngFile('entrenamiento.png'));
  await inputs.nth(1).setInputFiles(pngFile('frecuencia.png'));

  await page.getByRole('button', { name: /Registrar actividad/ }).click();
  await page.waitForURL('**/dashboard', { timeout: 30_000 });

  const main = page.locator('main');
  await expect(main).toContainText('PENDIENTE', { ignoreCase: true });
  // La fecha se muestra sin desfase de zona horaria (10 de marzo, no 9)
  await expect(main).toContainText('10-mar', { ignoreCase: true });
});

test('rechaza una segunda actividad para el mismo día', async ({ page }) => {
  await selectChallenge(page, process.env.E2E_UPLOAD_CHALLENGE!, '/dashboard/upload');

  await page.getByLabel('Fecha').fill(DATE);
  await page.getByLabel('Duración (min)').fill('40');
  await page.getByLabel('Minutos con FC').fill('30');
  const inputs = page.locator('input[type="file"]');
  await inputs.nth(0).setInputFiles(pngFile('entrenamiento.png'));
  await inputs.nth(1).setInputFiles(pngFile('frecuencia.png'));

  await page.getByRole('button', { name: /Registrar actividad/ }).click();
  await expect(page.locator('main')).toContainText(/Ya registraste una actividad/i);
});
