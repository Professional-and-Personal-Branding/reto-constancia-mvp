import { expect, test } from '@playwright/test';

import { api, closeChallenge, createActivity, e2eDate, enroll, setupChallenge, STATE, tokens } from '../fixtures/api';
import { selectChallenge } from '../fixtures/ui';

/**
 * Calendario propio del participante (spec participant-calendar): la tarjeta "Hoy" del panel y las
 * pistas de fecha del formulario de subir (incremento 1) y la grilla "Mi mes" con su racha
 * (incremento 2).
 * Casos cubiertos: TC-ACT-21, TC-ACT-22, TC-ACT-23.
 *
 * Solo recorre lo que necesita el navegador; las reglas (403, 404, validez igual a la del
 * registro, privacidad) se prueban en las pruebas de la API. Reutiliza la sesión guardada del
 * participante (sin logins nuevos) y fija el reloj del navegador dentro del período.
 */
const MONTH = 10;
const NAME = 'E2E Playwright · mi mes';

let challengeId = '';
let rejectedId = '';

test.use({ storageState: STATE.participant });

test.beforeAll(async () => {
  // Domingos (0) de descanso: en octubre de 2025 son 5, 12, 19 y 26
  const challenge = await setupChallenge({ month: MONTH, name: NAME, validDays: [1, 2, 3, 4, 5, 6] });
  challengeId = challenge.id;
  await enroll(challengeId, tokens().participantId);
  await createActivity(challengeId, e2eDate(MONTH, 14)); // ayer: queda registrado

  // Datos de la grilla "Mi mes": validada 6 y 10, pendiente 7, rechazada 8; sin registro 9 y 11
  const admin = tokens().admin;
  const validated = [6, 10];
  for (const day of validated) {
    const activity = await createActivity(challengeId, e2eDate(MONTH, day));
    await api('POST', `/activities/${activity.id}/validate`, { token: admin });
  }
  await createActivity(challengeId, e2eDate(MONTH, 7));
  const rejected = await createActivity(challengeId, e2eDate(MONTH, 8));
  rejectedId = rejected.id;
  await api('POST', `/activities/${rejected.id}/reject`, { token: admin, body: { reason: 'Foto borrosa' } });
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

test('Mi mes muestra cada estado, la racha y cabe en el teléfono', async ({ page }) => {
  // El día 13 se registra aquí (la prueba anterior lo necesita libre): con el 14 forma la racha
  await createActivity(challengeId, e2eDate(MONTH, 13));

  await page.setViewportSize({ width: 375, height: 812 });
  await page.clock.setFixedTime(new Date(`${e2eDate(MONTH, 15)}T12:00:00`));
  await selectChallenge(page, challengeId, '/dashboard');

  const section = page.getByRole('region', { name: 'Mi mes' });
  const table = section.getByRole('table', { name: `Mi mes: ${NAME}` });
  await expect(table).toBeVisible();

  // Encabezados de día, lunes primero
  await expect(table.getByRole('columnheader')).toHaveText(['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']);

  // Cada estado tiene nombre accesible con la fecha completa y su texto (no solo color)
  const validatedDay = table.getByRole('link', { name: 'lunes 6 de octubre: validado' });
  await expect(validatedDay).toHaveAttribute('href', /^#actividad-/);
  await expect(table.getByRole('link', { name: 'martes 7 de octubre: pendiente' })).toBeVisible();
  const rejectedDay = table.getByRole('link', { name: 'miércoles 8 de octubre: rechazado' });
  await expect(rejectedDay).toHaveAttribute('href', `#actividad-${rejectedId}`);
  await expect(table.getByRole('link', { name: 'jueves 9 de octubre: sin registro' })).toHaveAttribute(
    'href',
    `/dashboard/upload?date=${e2eDate(MONTH, 9)}`,
  );

  // Descanso y futuro: celdas sin enlace
  const restDay = table.getByRole('cell', { name: 'domingo 12 de octubre: descanso' });
  await expect(restDay).toBeVisible();
  await expect(restDay.getByRole('link')).toHaveCount(0);
  const futureDay = table.getByRole('cell', { name: 'jueves 16 de octubre: por venir' });
  await expect(futureDay).toBeVisible();
  await expect(futureDay.getByRole('link')).toHaveCount(0);

  // Hoy: abierto, con aria-current y enlace a registrar
  const todayCell = table.locator('td[aria-current="date"]');
  await expect(todayCell).toHaveCount(1);
  await expect(todayCell).toContainText('miércoles 15 de octubre: hoy');
  await expect(todayCell.getByRole('link')).toHaveAttribute('href', `/dashboard/upload?date=${e2eDate(MONTH, 15)}`);

  // Leyenda con los siete estados
  const legend = section.getByRole('list', { name: 'Leyenda de Mi mes' });
  await expect(legend.getByRole('listitem')).toHaveText([
    /Validado/,
    /Pendiente/,
    /Rechazado/,
    /Sin registro/,
    /Hoy/,
    /Descanso/,
    /Por venir/,
  ]);

  // Conteos y racha: 6 registrados de 24 días válidos (el reto de pruebas termina el 28); el 14 y el 13 suman, el 11 sin registro la corta
  await expect(section).toContainText('6 de 24 días válidos registrados');
  await expect(section).toContainText('Racha: 2 días');

  // Una actividad rechazada lleva a su fila, que muestra el motivo
  await rejectedDay.click();
  await expect(page).toHaveURL(new RegExp(`#actividad-${rejectedId}$`));
  await expect(page.locator(`#actividad-${rejectedId}`)).toContainText('Foto borrosa');

  // Teléfono: sin scroll horizontal y celdas de al menos 40 px
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const box = await validatedDay.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(40);
  expect(box!.height).toBeGreaterThanOrEqual(40);
});

test('un día sin registro abre la subida con esa fecha', async ({ page }) => {
  await page.clock.setFixedTime(new Date(`${e2eDate(MONTH, 15)}T12:00:00`));
  await selectChallenge(page, challengeId, '/dashboard');

  await page
    .getByRole('table', { name: `Mi mes: ${NAME}` })
    .getByRole('link', { name: 'jueves 9 de octubre: sin registro' })
    .click();

  await expect(page).toHaveURL(/\/dashboard\/upload\?date=2025-10-09$/);
  await expect(page.getByLabel('Fecha')).toHaveValue(e2eDate(MONTH, 9));
  await expect(page.locator('#activity-date-hint')).toHaveCount(0);
});
