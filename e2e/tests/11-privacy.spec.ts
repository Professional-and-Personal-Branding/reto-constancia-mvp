import { expect, test } from '@playwright/test';

import {
  api,
  API_URL,
  closeChallenge,
  e2eDate,
  E2E_YEAR,
  enroll,
  markPaid,
  setupChallenge,
  STATE,
  tokens,
} from '../fixtures/api';
import { selectChallenge } from '../fixtures/ui';

/**
 * Privacidad de los participantes (cambio participant-data-privacy).
 * Casos cubiertos: TC-SEC-06 a TC-SEC-11.
 *
 * Usa solo los tokens del setup (límite de 5 logins por minuto): Bruno, el "otro"
 * participante del seed, y su actividad los prepara el admin.
 */
const MONTH = 2;
const BRUNO = 'bruno@reto.local';
const PAYMENT_KEYS = ['paid', 'paidAt', 'amountPaid', 'paymentProofUrl', 'paymentProofCloudinaryId', 'paymentProofUploadedAt'];
const OWN_KEYS = ['amountPaid', 'joinedAt', 'paid', 'paidAt', 'paymentProofUploadedAt', 'paymentProofUrl'];

let challengeId = '';
let brunoId = '';
let brunoActivityId = '';
let anaActivityId = '';

test.beforeAll(async () => {
  const { admin, participantId } = tokens();
  const challenge = await setupChallenge({ month: MONTH, name: 'E2E Playwright · privacidad', feePerParticipant: 50 });
  challengeId = challenge.id;

  const users = await api<{ id: string; email: string }[]>('GET', '/users', { token: admin });
  brunoId = users.body.find((u) => u.email === BRUNO)!.id;
  await enroll(challengeId, participantId);
  await enroll(challengeId, brunoId);
  await markPaid(challengeId, participantId, true);
  await markPaid(challengeId, brunoId, false);

  // Actividad de Bruno cargada por el admin con la importación (sin login de Bruno)
  const header =
    'email,name,challengeMonth,challengeYear,date,exerciseType,durationMinutes,distanceKm,avgHeartRate,heartRateMinutes,hasHeartRateProof,status,notes,photoUrl';
  const row = [BRUNO, 'Bruno', MONTH, E2E_YEAR, e2eDate(MONTH, 3), 'RUNNING', 40, 5, 140, '', false, 'PENDING', 'privacidad', 'https://example.com/e2e/bruno.png'].join(',');
  const form = new FormData();
  form.append('file', new Blob([`${header}\n${row}`], { type: 'text/csv' }), 'privacidad.csv');
  const imported = await fetch(`${API_URL}/import/activities/commit?duplicateStrategy=update`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${admin}` },
    body: form,
  });
  expect(imported.ok).toBe(true);
  const acts = await api<{ id: string; userId: string }[]>('GET', `/activities?challengeId=${challengeId}`, { token: admin });
  brunoActivityId = acts.body.find((a) => a.userId === brunoId)!.id;

  const own = await api<{ id: string }>('POST', '/activities', {
    token: tokens().participant,
    body: {
      challengeId,
      date: e2eDate(MONTH, 4),
      exerciseType: 'RUNNING',
      durationMinutes: 40,
      photos: [{ url: 'https://example.com/e2e/ana.png', cloudinaryId: 'e2e/privacidad/ana', type: 'ACTIVITY' }],
    },
  });
  expect(own.status).toBe(201);
  anaActivityId = own.body.id;
});

test.afterAll(async () => {
  await closeChallenge(MONTH);
});

test.describe('API', () => {
  test('el ranking no expone emails ni estado de pago a un participante', async () => {
    const res = await api('GET', `/challenges/${challengeId}/results`, { token: tokens().participant });
    expect(res.status).toBe(200);
    for (const list of [res.body.ranking, res.body.tiedAtTop, res.body.winners, res.body.awards]) {
      for (const r of list) {
        expect(r).not.toHaveProperty('email');
        for (const key of PAYMENT_KEYS) expect(r).not.toHaveProperty(key);
      }
    }
    expect(res.body.ranking.map((r: { userId: string }) => r.userId)).toContain(brunoId);
    expect(res.body.payout).toBeDefined();
  });

  test('la lista de retos activos no trae inscritos y el pago propio va en me', async () => {
    const res = await api<any[]>('GET', '/challenges/active/list', { token: tokens().participant });
    const mine = res.body.find((c) => c.id === challengeId);
    for (const c of res.body) expect(c).not.toHaveProperty('participants');
    expect(mine.isParticipant).toBe(true);
    expect(Object.keys(mine.me).sort()).toEqual(OWN_KEYS);
    expect(mine.me.paid).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain(BRUNO);
  });

  test('el detalle del reto se proyecta por rol', async () => {
    const asAna = await api('GET', `/challenges/${challengeId}`, { token: tokens().participant });
    expect(asAna.body).not.toHaveProperty('participants');
    expect(asAna.body.me.paid).toBe(true);
    const asAdmin = await api('GET', `/challenges/${challengeId}`, { token: tokens().admin });
    expect(asAdmin.body.participants.length).toBe(2);
    expect(asAdmin.body).toHaveProperty('me');
  });

  test('el listado de inscritos es solo para admin', async () => {
    expect((await api('GET', `/challenges/${challengeId}/participants`, { token: tokens().participant })).status).toBe(403);
    expect((await api('GET', `/challenges/${challengeId}/participants`, { token: tokens().admin })).status).toBe(200);
  });

  test('el detalle de una actividad ajena da 403', async () => {
    const other = await api('GET', `/activities/${brunoActivityId}`, { token: tokens().participant });
    expect(other.status).toBe(403);
    expect(other.body.message).toBe('No puedes ver esta actividad');
    expect((await api('GET', `/activities/${anaActivityId}`, { token: tokens().participant })).status).toBe(200);
    expect((await api('GET', `/activities/${brunoActivityId}`, { token: tokens().admin })).status).toBe(200);
  });

  test('el admin conserva emails y pagos en el ranking y en la lista de activos', async () => {
    const results = await api('GET', `/challenges/${challengeId}/results`, { token: tokens().admin });
    const bruno = results.body.ranking.find((r: { userId: string }) => r.userId === brunoId);
    expect(bruno).toMatchObject({ email: BRUNO, paid: false });
    const list = await api<any[]>('GET', '/challenges/active/list', { token: tokens().admin });
    const emails = list.body.find((c) => c.id === challengeId).participants.map((p: any) => p.user.email);
    expect(emails).toContain(BRUNO);
  });
});

test.describe('Web del participante', () => {
  test.use({ storageState: STATE.participant });

  test('el ranking muestra nombres sin emails y marca la fila propia', async ({ page }) => {
    await selectChallenge(page, challengeId, '/dashboard/results');
    const table = page.locator('table');
    await expect(table).toContainText('(tú)');
    await expect(table).toContainText('Bruno');
    await expect(table).not.toContainText('@reto.local');
  });

  test('el dashboard muestra el estado de pago propio', async ({ page }) => {
    await selectChallenge(page, challengeId, '/dashboard');
    const proof = page.locator('section').filter({ hasText: 'Comprobante de pago' });
    await expect(proof).toContainText('Estado: pagado');
  });
});

test.describe('Web del admin', () => {
  test.use({ storageState: STATE.admin });

  test('el ranking muestra el email de cada participante', async ({ page }) => {
    await selectChallenge(page, challengeId, '/dashboard/results');
    await expect(page.locator('table')).toContainText(BRUNO);
  });
});
