import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

import { expect, Page, test } from '@playwright/test';

import { api, API_URL, STATE, tokens } from '../fixtures/api';
import { pngFile } from '../fixtures/ui';

/**
 * Capturas de la guía de uso y evidencia visual de los casos de UI del catálogo.
 *
 * Datos de demostración: "Reto Octubre 2026" (período 1 sep – 31 oct 2026, lunes a sábado,
 * 20 min de FC, cuota 150 BOB, presupuesto 900 BOB, 10 puntos por día + 1 por km, mínimo 5
 * días, 1 ganador, desempate por km) con los cinco participantes del seed. Convive con el
 * reto de mayo del seed, así que el selector de reto aparece.
 */
// GUIDE_SHOTS_DIR permite validar la suite sin reescribir las capturas versionadas de la guía
const SHOTS = process.env.GUIDE_SHOTS_DIR ?? join(__dirname, '..', '..', 'docs', 'guia-capturas');
const MONTH = 10;
const YEAR = 2026;
const NAME = 'Reto Octubre 2026';
const ALL = ['ana', 'bruno', 'carla', 'diego', 'elena'];
const NAMES: Record<string, string> = {
  ana: 'Ana Constante',
  bruno: 'Bruno Kilometros',
  carla: 'Carla Disciplina',
  diego: 'Diego Sin Excusas',
  elena: 'Elena Manada',
};

let challengeId = '';

async function shot(page: Page, file: string, target?: ReturnType<Page['locator']>) {
  const path = join(SHOTS, file);
  // Espera a que carguen las fotos (vienen de un host externo) antes de fotografiar
  await page
    .waitForFunction(() => Array.from(document.images).every((img) => img.complete), null, { timeout: 8_000 })
    .catch(() => undefined);
  if (target) {
    // El encabezado es fijo: en una captura de elemento taparía su borde superior
    await page.addStyleTag({ content: 'header{position:static !important}' });
    await target.scrollIntoViewIfNeeded();
    await target.screenshot({ path, type: 'jpeg', quality: 78 });
  } else {
    await page.screenshot({ path, type: 'jpeg', quality: 78 });
  }
}

async function pick(page: Page, path: string) {
  await page.goto(path);
  await page.evaluate((cid) => window.localStorage.setItem('reto.selectedChallengeId', cid), challengeId);
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}

/** Importa filas con el endpoint de carga masiva (como lo haría el admin). */
async function importRows(rows: string[], strategy: 'skip' | 'update' = 'update') {
  const header =
    'email,name,challengeMonth,challengeYear,date,exerciseType,durationMinutes,distanceKm,avgHeartRate,heartRateMinutes,hasHeartRateProof,status,notes,photoUrl';
  const form = new FormData();
  form.append('file', new Blob([[header, ...rows].join('\n')], { type: 'text/csv' }), 'demo.csv');
  const res = await fetch(`${API_URL}/import/activities/commit?duplicateStrategy=${strategy}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokens().admin}` },
    body: form,
  });
  const body = await res.json();
  if (!res.ok || body.errors?.length) throw new Error(`Importación de demo falló: ${JSON.stringify(body)}`);
}

const photo = (seed: string) => `https://picsum.photos/seed/${seed}/900/600`;
function row(who: string, date: string, km: number, hr: number | '', proof: boolean, status: string, notes = '') {
  return [
    `${who}@reto.local`, NAMES[who], MONTH, YEAR, date, 'RUNNING', 40, km, 145, hr, proof, status, notes, photo(`${who}-${date}`),
  ].join(',');
}

test.beforeAll(async () => {
  mkdirSync(SHOTS, { recursive: true });
  const { admin } = tokens();

  // Reto de demostración (reutilizable entre corridas)
  const list = await api<{ id: string; month: number; year: number; status: string }[]>('GET', '/challenges', { token: admin });
  const rules = {
    name: NAME,
    startDate: `${YEAR}-09-01T00:00:00.000Z`,
    endDate: `${YEAR}-10-31T23:59:59.000Z`,
    validDays: [1, 2, 3, 4, 5, 6],
    minHeartRateMinutes: 20,
    feePerParticipant: 150,
    budgetTotal: 900,
    currency: 'BOB',
    prizeDescription: 'Inscripción a la carrera de fin de año para quien gane',
    pointsPerValidatedDay: 10,
    pointsPerKm: 1,
    minValidatedDaysToQualify: 5,
    maxWinners: 1,
    tiebreakRule: 'TOTAL_KM',
  };
  let challenge = list.body.find((c) => c.month === MONTH && c.year === YEAR);
  // Un reto cerrado es definitivo: si una corrida anterior lo cerró, se borra y se crea de nuevo
  if (challenge?.status === 'COMPLETED') {
    const { deleteTestChallenges } = await import('../../scripts/lib/test-db.mjs');
    await deleteTestChallenges([{ month: MONTH, year: YEAR }]);
    challenge = undefined;
  }
  if (challenge) {
    const acts = await api<{ id: string }[]>('GET', `/activities?challengeId=${challenge.id}`, { token: admin });
    for (const a of acts.body) await api('DELETE', `/activities/${a.id}`, { token: admin });
    await api('PATCH', `/challenges/${challenge.id}`, { token: admin, body: rules });
  } else {
    const created = await api<{ id: string }>('POST', '/challenges', { token: admin, body: { ...rules, month: MONTH, year: YEAR } });
    if (created.status !== 201) throw new Error(`No se pudo crear el reto de demo: ${JSON.stringify(created.body)}`);
    challenge = { ...created.body, month: MONTH, year: YEAR, status: 'DRAFT' };
  }
  challengeId = challenge.id;
  await api('POST', `/challenges/${challengeId}/activate`, { token: admin });

  // Historial validado (septiembre 2026: el 1 es martes, el 6 es domingo)
  const validated = [
    ...['01', '02', '03', '04', '05', '07'].map((d) => row('ana', `${YEAR}-09-${d}`, 6, 30, true, 'VALIDATED')),
    ...['01', '02', '03', '04', '05', '07'].map((d) => row('carla', `${YEAR}-09-${d}`, 5, 32, true, 'VALIDATED')),
    ...['01', '02', '03', '04', '05'].map((d) => row('bruno', `${YEAR}-09-${d}`, 7, 28, true, 'VALIDATED')),
    ...['01', '02', '03'].map((d) => row('diego', `${YEAR}-09-${d}`, 10, 35, true, 'VALIDATED')),
  ];
  // Pendientes de validación: una que cumple y dos que no cumplen la regla de 20 min de FC
  const pending = [
    row('bruno', `${YEAR}-09-08`, 7, 30, true, 'PENDING', 'Fondo largo por el parque'),
    row('diego', `${YEAR}-09-08`, 9, '', false, 'PENDING', 'Olvidé el reloj'),
    row('elena', `${YEAR}-09-08`, 4, 10, true, 'PENDING', 'Solo 10 min con banda'),
    row('ana', `${YEAR}-09-09`, 6, 30, true, 'PENDING', 'Intervalos en pista'),
    row('ana', `${YEAR}-09-08`, 6, '', false, 'PENDING', 'Sin captura'),
  ];
  await importRows([...validated, ...pending]);

  // Un rechazo con motivo para que Ana lo vea en su lista
  const acts = await api<{ id: string; date: string; user: { email: string } }[]>('GET', `/activities?challengeId=${challengeId}&status=PENDING`, { token: admin });
  const anaNoProof = acts.body.find((a) => a.user.email === 'ana@reto.local' && a.date.startsWith(`${YEAR}-09-08`));
  if (anaNoProof) {
    await api('POST', `/activities/${anaNoProof.id}/reject`, { token: admin, body: { reason: 'La captura no muestra los minutos de frecuencia cardíaca' } });
  }

  // Pagos: dos completos, uno parcial, dos pendientes. Ana además subió su comprobante.
  const participants = await api<{ userId: string; user: { email: string } }[]>('GET', `/challenges/${challengeId}/participants`, { token: admin });
  const byEmail = Object.fromEntries(participants.body.map((p) => [p.user.email.split('@')[0], p.userId]));
  const pay = (who: string, body: Record<string, unknown>) =>
    api('PATCH', `/challenges/${challengeId}/participants/${byEmail[who]}/payment`, { token: admin, body });
  await pay('ana', { paid: true });
  await pay('bruno', { paid: true });
  await pay('carla', { paid: true, amountPaid: 75 });
  await pay('diego', { paid: false });
  await pay('elena', { paid: false });
  await api('PATCH', `/challenges/${challengeId}/participants/me/payment-proof`, {
    token: tokens().participant,
    body: { paymentProofUrl: 'https://placehold.co/600x800/0a0a0a/ff6b35.png?text=Comprobante%20150%20BOB', paymentProofCloudinaryId: 'demo/comprobante-ana' },
  });
  expect(ALL.every((who) => byEmail[who])).toBe(true);
});

test.describe('Pantallas públicas', () => {
  test('inicio de sesión y registro', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('ana@reto.local');
    await shot(page, '01-login.jpg');

    await page.goto('/register');
    await page.getByLabel('Nombre').fill('Fernanda Trote');
    await page.getByLabel('Email').fill(`fernanda+${Date.now()}@reto.local`);
    await page.getByLabel('Contraseña').fill('corta');
    await page.getByRole('button', { name: /Crear cuenta|Registrarme|Entrar/ }).click();
    await expect(page.locator('main')).toContainText(/contraseña|password/i);
    await shot(page, '02-registro-error.jpg');
  });

  test('Swagger documenta la API', async ({ page }) => {
    await page.goto(`${API_URL}/docs`);
    await expect(page.locator('body')).toContainText('challenges');
    await expect(page.locator('body')).toContainText('activities');
    await shot(page, '22-swagger.jpg');
  });
});

test.describe('Participante', () => {
  test.use({ storageState: STATE.participant });

  test('panel Mi reto muestra período, cuenta regresiva y métricas', async ({ page }) => {
    await pick(page, '/dashboard');
    const main = page.locator('main');
    await expect(main).toContainText(NAME, { ignoreCase: true });
    await expect(main).toContainText(/01-sep/i);
    await expect(main).toContainText(/Finaliza en/i);
    await expect(main).toContainText(/Validados/i);
    await expect(main).toContainText(/Posición/i);
    await expect(main).toContainText(/96\s*pts/i);
    await expect(page.getByLabel('Reto activo seleccionado')).toBeVisible();
    await shot(page, '03-mi-reto.jpg');
  });

  test('comprobante de pago disponible para el participante', async ({ page }) => {
    await pick(page, '/dashboard');
    const proof = page.getByRole('button', { name: /Reemplazar comprobante|Subir comprobante/ });
    await expect(proof).toBeVisible();
    await proof.scrollIntoViewIfNeeded();
    await shot(page, '09-comprobante.jpg');
  });

  test('mis actividades con validada, pendiente y rechazada', async ({ page }) => {
    await pick(page, '/dashboard');
    const list = page.locator('main');
    await expect(list).toContainText(/Validado/i);
    await expect(list).toContainText(/Pendiente/i);
    await expect(list).toContainText(/Rechazado/i);
    await expect(list).toContainText('La captura no muestra los minutos');
    await page.getByText('Mis actividades').scrollIntoViewIfNeeded();
    await shot(page, '12-mis-actividades.jpg');
  });

  test('retirar una actividad pendiente pide confirmación', async ({ page }) => {
    await pick(page, '/dashboard');
    const list = page.getByLabel('Mis actividades');
    await list.getByRole('button', { name: 'Retirar' }).first().click();
    await expect(page.getByRole('button', { name: 'Sí, retirar' })).toBeVisible();
    // Solo se fotografía la confirmación: no se retira nada de los datos de demostración
    await shot(page, '26-retirar-actividad.jpg', list);
    await page.getByRole('button', { name: 'No' }).click();
  });

  test('formulario de subida bloqueado y listo', async ({ page }) => {
    await pick(page, '/dashboard/upload');
    await page.getByLabel('Duración (min)').fill('45');
    await page.getByLabel('Distancia (km, opcional)').fill('7.2');
    await page.getByLabel('Minutos con FC').fill('12');
    await expect(page.locator('[role="status"]')).toContainText('20');
    await expect(page.getByRole('button', { name: /Registrar actividad/ })).toBeDisabled();
    await shot(page, '10-subir-bloqueado.jpg');

    await page.getByLabel('Minutos con FC').fill('38');
    const files = page.locator('input[type="file"]');
    await files.nth(0).setInputFiles(pngFile('entrenamiento.png'));
    await files.nth(1).setInputFiles(pngFile('frecuencia.png'));
    await expect(page.getByRole('button', { name: /Registrar actividad/ })).toBeEnabled();
    await shot(page, '11-subir-listo.jpg');
  });

  test('ranking con puntos, no califica y premio proyectado', async ({ page }) => {
    await pick(page, '/dashboard/results');
    await expect(page.getByLabel('Regla de puntaje')).toContainText('10 por día validado');
    await expect(page.locator('table thead')).toContainText('PUNTOS', { ignoreCase: true });
    await expect(page.locator('table')).toContainText('no califica');
    await expect(page.getByLabel('Premio por ganador')).toContainText('900 BOB');
    await expect(page.locator('main')).toContainText('top actual: 96 puntos');
    await shot(page, '16-ranking.jpg');
  });

  test('ranking de un reto cerrado', async ({ page }) => {
    const closedId = await closedDemoChallenge();
    await page.goto('/dashboard/results');
    await page.getByLabel('Retos cerrados').selectOption(closedId);
    await expect(page).toHaveURL(new RegExp(`\\?reto=${closedId}`));
    await expect(page.locator('main')).toContainText(`${CLOSED_NAME} · cerrado el`);
    await expect(page.locator('.card').filter({ hasText: /Ganador/ })).toContainText('Carla Disciplina');
    await expect(page.getByLabel('Premio por ganador')).not.toContainText('proyectado');
    await shot(page, '17-ranking-cerrado.jpg');
  });
});

const CLOSED_NAME = 'Reto Agosto 2026';

/**
 * Reto cerrado de demostración: agosto de 2026, con historial validado y la premiación
 * registrada (que cierra el reto). Si ya existe cerrado se reutiliza tal cual.
 */
async function closedDemoChallenge(): Promise<string> {
  const { admin } = tokens();
  const list = await api<{ id: string; month: number; year: number; status: string }[]>('GET', '/challenges', { token: admin });
  const existing = list.body.find((c) => c.month === 8 && c.year === YEAR);
  if (existing?.status === 'COMPLETED') return existing.id;

  let id = existing?.id;
  if (!id) {
    const created = await api<{ id: string }>('POST', '/challenges', {
      token: admin,
      body: {
        name: CLOSED_NAME, month: 8, year: YEAR,
        startDate: `${YEAR}-08-01T00:00:00.000Z`, endDate: `${YEAR}-08-31T23:59:59.000Z`,
        validDays: [1, 2, 3, 4, 5, 6], minHeartRateMinutes: 20, feePerParticipant: 150, budgetTotal: 600,
        currency: 'BOB', prizeDescription: 'Zapatillas de running para quien gane',
      },
    });
    if (created.status !== 201) throw new Error(`No se pudo crear el reto cerrado: ${JSON.stringify(created.body)}`);
    id = created.body.id;
  }
  await api('POST', `/challenges/${id}/activate`, { token: admin });

  // Agosto de 2026: el 3 es lunes. Carla valida seis días, Ana cinco y Bruno cuatro.
  const days = ['03', '04', '05', '06', '07', '08'];
  const rows = [
    ...days.map((d) => ['carla', d, 6]),
    ...days.slice(0, 5).map((d) => ['ana', d, 7]),
    ...days.slice(0, 4).map((d) => ['bruno', d, 8]),
  ].map(([who, d, km]) =>
    [`${who}@reto.local`, NAMES[who as string], 8, YEAR, `${YEAR}-08-${d}`, 'RUNNING', 40, km, 145, 30, true, 'VALIDATED', '', photo(`${who}-08-${d}`)].join(','),
  );
  await importRows(rows);

  const participants = await api<{ userId: string; user: { email: string } }[]>('GET', `/challenges/${id}/participants`, { token: admin });
  const carla = participants.body.find((p) => p.user.email === 'carla@reto.local');
  if (!carla) throw new Error('Carla no quedó inscrita en el reto cerrado');
  await api('POST', `/challenges/${id}/awards`, {
    token: admin,
    body: { userIds: [carla.userId], notes: 'Zapatillas entregadas en la reunión de septiembre' },
  });
  return id;
}

test.describe('Administrador', () => {
  test.use({ storageState: STATE.admin });

  test('menú de administración y lista de retos', async ({ page }) => {
    await pick(page, '/dashboard');
    await shot(page, '04-menu-admin.jpg');

    await page.goto('/dashboard/admin/challenges');
    await expect(page.locator('main')).toContainText(NAME);
    await shot(page, '05-retos-lista.jpg');

    await page.getByRole('button', { name: /Nuevo reto/ }).click();
    const form = page.locator('form').first();
    await expect(form).toContainText('Reglas de puntaje', { ignoreCase: true });
    await shot(page, '06-reto-formulario.jpg', form);
  });

  test('interruptor de tema en el encabezado', async ({ page }) => {
    await pick(page, '/dashboard');
    const toggle = page.getByRole('switch', { name: 'Modo claro' });
    // El sistema está en claro y nadie eligió otro tema: el interruptor aparece encendido
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
    await shot(page, '23-tema-interruptor.jpg', page.locator('header'));
  });

  test('selector de reto con varios retos activos', async ({ page }) => {
    await pick(page, '/dashboard');
    const header = page.locator('header');
    await expect(page.getByLabel('Reto activo seleccionado')).toBeVisible();
    await shot(page, '07-selector-reto.jpg', header);
  });

  test('participantes con resumen financiero', async ({ page }) => {
    await pick(page, '/dashboard/admin/participants');
    const summary = page.getByLabel('Resumen financiero');
    await expect(summary).toContainText('750 BOB'); // 5 inscritos x 150
    await expect(summary).toContainText('375 BOB'); // 150 + 150 + 75
    await expect(page.locator('main')).toContainText('Parcial');
    await expect(page.locator('main')).toContainText('Ver comprobante de pago');
    await shot(page, '08-participantes-finanzas.jpg');
  });

  test('registrar un pago parcial', async ({ page }) => {
    await pick(page, '/dashboard/admin/participants');
    const row = page.getByLabel('Participante Diego Sin Excusas');
    await row.getByRole('button', { name: 'Marcar pagado' }).click();
    await expect(row.getByLabel('Monto recibido')).toHaveValue('150');
    await row.getByLabel('Monto recibido').fill('75');
    // Se fotografía el formulario sin guardar, para no cambiar los pagos de la demostración
    await shot(page, '25-pago-parcial.jpg', row);
    await row.getByRole('button', { name: 'Cancelar' }).click();
  });

  test('editar un reto activo', async ({ page }) => {
    await page.goto('/dashboard/admin/challenges');
    await page.getByLabel(`Reto ${NAME}`, { exact: true }).getByRole('button', { name: 'Editar' }).click();
    const form = page.getByRole('form', { name: `Editar ${NAME}` });
    await expect(form).toContainText('El reto está activo');
    await expect(form.getByLabel('Cuota / persona')).toHaveValue('150');
    await shot(page, '24-editar-reto.jpg', form);
    await form.getByRole('button', { name: 'Cancelar' }).click();
  });

  test('validaciones: chips, override y rechazo', async ({ page }) => {
    await page.goto('/dashboard/admin/validations');
    const diego = page.locator('.card').filter({ hasText: 'diego@reto.local' }).filter({ hasText: 'Olvidé el reloj' });
    const bruno = page.locator('.card').filter({ hasText: 'bruno@reto.local' }).filter({ hasText: 'Fondo largo' });
    await expect(diego).toContainText('No cumple FC', { ignoreCase: true });
    await expect(bruno).toContainText('Cumple FC', { ignoreCase: true });
    await bruno.scrollIntoViewIfNeeded();
    await shot(page, '13-validar-pendientes.jpg');

    await diego.getByRole('button', { name: /Validar/ }).click();
    await diego.getByLabel('Nota de override').fill('Corrió con el grupo, lo verifiqué en persona');
    await shot(page, '14-validar-override.jpg', diego);
    await diego.getByRole('button', { name: 'Cancelar' }).click();

    const elena = page.locator('.card').filter({ hasText: 'elena@reto.local' }).filter({ hasText: 'Solo 10 min' });
    await elena.getByRole('button', { name: /Rechazar/ }).click();
    await elena.getByPlaceholder('Razón del rechazo').fill('La captura muestra solo 10 minutos de FC');
    await shot(page, '15-rechazar.jpg', elena);
    await elena.getByRole('button', { name: 'Cancelar' }).click();
  });

  test('panel de premiación', async ({ page }) => {
    await pick(page, '/dashboard/results');
    const panel = page.locator('.card').filter({ hasText: 'Guardar premiación' });
    await expect(panel).toBeVisible();
    // Viene marcada solo quien gana con las reglas del reto (1 ganador, desempate por km)
    await expect(panel.getByRole('checkbox', { name: /Ana Constante/ })).toBeChecked();
    await expect(panel.getByRole('checkbox', { name: /Carla Disciplina/ })).not.toBeChecked();
    await expect(panel.getByRole('checkbox', { name: /Diego Sin Excusas/ })).not.toBeChecked();
    await shot(page, '18-premiacion.jpg', panel);
  });

  test('importación: vista previa, resultado y Google Sheets', async ({ page }) => {
    await page.goto('/dashboard/admin/import');
    const csv = [
      'email,name,challengeMonth,challengeYear,date,exerciseType,durationMinutes,distanceKm,avgHeartRate,heartRateMinutes,hasHeartRateProof,status,notes,photoUrl',
      row('elena', `${YEAR}-09-10`, 5, 30, true, 'VALIDATED', 'Planilla de septiembre'),
      row('elena', `${YEAR}-09-11`, 5, '', false, 'VALIDATED', 'Planilla de septiembre'),
      `elena@reto.local,Elena Manada,${MONTH},${YEAR},${YEAR}-09-12,NADAR,40,5,140,30,true,VALIDATED,tipo de ejercicio inexistente,`,
    ].join('\n');
    await page.locator('input[type="file"]').setInputFiles({ name: 'septiembre.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
    const fileSection = page.locator('section').filter({ hasText: '2. Subir archivo' });
    await fileSection.getByRole('button', { name: 'Previsualizar' }).click();
    const preview = page.locator('section').filter({ hasText: 'Previsualización' });
    await expect(preview).toContainText('2 válidas');
    await expect(preview).toContainText(/con error/i);
    await expect(preview).toContainText(/regla de FC/i);
    await shot(page, '19-importar-preview.jpg', preview);

    await fileSection.getByRole('button', { name: /Importar/ }).click();
    const result = page.locator('section').filter({ hasText: 'Importación completada' });
    await expect(result).toBeVisible();
    await shot(page, '20-importar-resultado.jpg', result);

    const sheets = page.getByLabel('Importar desde Google Sheets');
    await expect(sheets).toContainText('GOOGLE_SERVICE_ACCOUNT_EMAIL');
    await shot(page, '21-importar-sheets.jpg', sheets);
  });
});
