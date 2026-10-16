import { expect, test } from '@playwright/test';

import { closeChallenge, createActivity, e2eDate, enroll, setupChallenge, STATE, tokens } from '../fixtures/api';
import { selectChallenge } from '../fixtures/ui';

/**
 * Calendario propio del participante (spec participant-calendar), incremento 1: la tarjeta "Hoy"
 * del panel y las pistas de fecha del formulario de subir.
 * Casos cubiertos: TC-ACT-21, TC-ACT-22.
 *
 * Solo recorre lo que necesita el navegador; las reglas (403, 404, validez igual a la del
 * registro, privacidad) se prueban en las pruebas de la API. Reutiliza la sesión guardada del
 * participante (sin logins nuevos) y fija el reloj del navegador dentro del período.
 */
const MONTH = 10;
const NAME = 'E2E Playwright · mi mes';

let challengeId = '';

test.use({ storageState: STATE.participant });

test.beforeAll(async () => {
  // Domingos (0) de descanso: en octubre de 2025 son 5, 12, 19 y 26
  const challenge = await setupChallenge({ month: MONTH, name: NAME, validDays: [1, 2, 3, 4, 5, 6] });
  challengeId = challenge.id;
  await enroll(challengeId, tokens().participantId);
  await createActivity(challengeId, e2eDate(MONTH, 14)); // ayer: queda registrado
});

test.afterAll(async () => {
  await closeChallenge(MONTH);
});

test('la tarjeta de hoy guía según el día y la subida avisa un día de descanso', async ({ page }) => {
  // Miércoles 15 de octubre de 2025: día válido sin actividad
  await page.clock.setFixedTime(new Date(`${e2eDate(MONTH, 15)}T12:00:00`));
  await selectChallenge(page, challengeId, '/dashboard');

  await expect(page.getByText('Hoy es día válido y aún no registraste tu actividad')).toBeVisible();
  await page.getByRole('link', { name: 'Registrar hoy' }).click();

  // "Registrar hoy" abre el formulario con la fecha de hoy
  await expect(page).toHaveURL(/\/dashboard\/upload\?date=2025-10-15/);
  const date = page.getByLabel('Fecha');
  await expect(date).toHaveValue(e2eDate(MONTH, 15));
  await expect(date).toHaveAttribute('min', e2eDate(MONTH, 1));
  await expect(date).toHaveAttribute('max', e2eDate(MONTH, 15)); // no pasa de hoy

  const submit = page.getByRole('button', { name: /Registrar actividad/ });
  const hint = page.locator('#activity-date-hint');
  await expect(hint).toHaveCount(0);

  // Domingo: día de descanso
  await date.fill(e2eDate(MONTH, 12));
  await expect(hint).toHaveText('Ese día es de descanso en este reto');
  await expect(submit).toBeDisabled();

  // Un día que ya tiene actividad
  await date.fill(e2eDate(MONTH, 14));
  await expect(hint).toHaveText('Ya registraste una actividad para ese día');
  await expect(submit).toBeDisabled();

  // Un día válido y libre quita la pista (el envío sigue pidiendo la foto, que es del navegador)
  await date.fill(e2eDate(MONTH, 13));
  await expect(hint).toHaveCount(0);

  // Un día de descanso desde la URL: la fecha se respeta y se avisa
  await page.goto(`/dashboard/upload?date=${e2eDate(MONTH, 12)}`);
  await expect(page.getByLabel('Fecha')).toHaveValue(e2eDate(MONTH, 12));
  await expect(page.locator('#activity-date-hint')).toHaveText('Ese día es de descanso en este reto');

  // Tarjeta del panel en un domingo, antes del período y después del período
  await page.clock.setFixedTime(new Date(`${e2eDate(MONTH, 12)}T12:00:00`));
  await page.goto('/dashboard');
  await expect(page.getByText('Hoy es día de descanso')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Registrar hoy' })).toHaveCount(0);

  await page.clock.setFixedTime(new Date('2025-09-30T12:00:00'));
  await page.goto('/dashboard');
  await expect(page.getByText(/El reto empieza el 1 de octubre/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Registrar hoy' })).toHaveCount(0);

  await page.clock.setFixedTime(new Date('2025-10-29T12:00:00'));
  await page.goto('/dashboard');
  await expect(page.getByText('El período del reto terminó')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Registrar hoy' })).toHaveCount(0);

  // Hoy con actividad: "Hoy ya está"
  await page.clock.setFixedTime(new Date(`${e2eDate(MONTH, 14)}T12:00:00`));
  await page.goto('/dashboard');
  await expect(page.getByText('Hoy ya está')).toBeVisible();
  await expect(page.getByText('Hoy es día válido y aún no registraste tu actividad')).toHaveCount(0);
});
