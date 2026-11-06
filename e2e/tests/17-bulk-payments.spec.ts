import { expect, test } from '@playwright/test';

import { api, closeChallenge, enroll, markPaid, setupChallenge, STATE, tokens } from '../fixtures/api';
import { selectChallenge } from '../fixtures/ui';

/**
 * Recorrido de pagos en lote (OpenSpec: bulk-payment-marking): seleccionar, confirmar, ver el
 * resultado y copiar la lista de pendientes. Caso cubierto: TC-PART-11.
 */
const MONTH = 8;

test.use({ storageState: STATE.admin });

let challengeId: string;
const throwawayIds: string[] = [];

test.beforeAll(async () => {
  const { admin, participantId } = tokens();
  const challenge = await setupChallenge({
    month: MONTH,
    name: 'E2E Playwright · pagos en lote',
    feePerParticipant: 120,
  });
  challengeId = challenge.id;

  // Dos personas sin pago (desechables) y la del seed con un pago parcial de 60
  const stamp = Date.now();
  for (const name of ['Lote Uno', 'Lote Dos']) {
    const email = `lote-${name.split(' ')[1].toLowerCase()}-${stamp}@e2e.local`;
    const reg = await api('POST', '/auth/register', { body: { name, email, password: 'Desechable123' } });
    expect(reg.status).toBe(201);
    const users = await api<{ id: string; email: string }[]>('GET', '/users', { token: admin });
    const id = users.body.find((u) => u.email === email)!.id;
    throwawayIds.push(id);
    await enroll(challengeId, id);
  }
  await enroll(challengeId, participantId);
  await markPaid(challengeId, participantId, true, 60);
});

test.afterAll(async () => {
  const { admin } = tokens();
  await closeChallenge(MONTH);
  // Los desechables dejan de ser candidatos de inscripción en otros recorridos
  for (const id of throwawayIds) await api('PATCH', `/users/${id}`, { token: admin, body: { active: false } });
});

test('marca pagos en lote con confirmación y copia la lista de pendientes', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await selectChallenge(page, challengeId, '/dashboard/admin/participants');

  const filters = page.getByRole('group', { name: 'Filtrar inscritos' });
  await expect(filters.getByRole('button', { name: 'Pagados (0)' })).toBeVisible();
  await expect(filters.getByRole('button', { name: 'Parciales (1)' })).toBeVisible();

  // Sin pago: dos personas; el diálogo dice el total y no se envía nada hasta confirmar
  await page.getByRole('button', { name: 'Seleccionar sin pagar' }).click();
  const bulk = page.getByRole('button', { name: /^Marcar seleccionados como pagados/ });
  await expect(bulk).toHaveText('Marcar seleccionados como pagados (2)');
  await bulk.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Se registrará la cuota de 120 BOB a 2 personas: 240 BOB.');
  await expect(dialog).not.toContainText('No se tocan:');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(filters.getByRole('button', { name: 'Pagados (0)' })).toBeVisible();

  // Con la del pago parcial elegida también, el diálogo la lista aparte y el total no cambia
  const partialRow = page.locator('[aria-label^="Participante "]').filter({ hasText: 'ana@reto.local' });
  const partialBox = partialRow.getByRole('checkbox');
  const partialName = (await partialBox.getAttribute('aria-label'))!.replace('Seleccionar el pago de ', '');
  await partialBox.check();
  await expect(bulk).toHaveText('Marcar seleccionados como pagados (3)');
  await bulk.click();
  await expect(dialog).toContainText('Se registrará la cuota de 120 BOB a 2 personas: 240 BOB.');
  await expect(dialog).toContainText('No se tocan:');
  await expect(dialog).toContainText(`${partialName}: pago parcial de 60 BOB`);

  await dialog.getByRole('button', { name: 'Confirmar' }).click();
  await expect(dialog).toHaveCount(0);
  const status = page.getByRole('status').filter({ hasText: 'pagos registrados' });
  await expect(status).toContainText('2 pagos registrados');
  await expect(status).toContainText(`1 sin tocar (pago parcial o monto distinto): ${partialName}`);
  await expect(filters.getByRole('button', { name: 'Pagados (2)' })).toBeVisible();
  await expect(filters.getByRole('button', { name: 'Parciales (1)' })).toBeVisible();
  await expect(bulk).toHaveText('Marcar seleccionados como pagados (0)');

  // Quien aún debe: solo la del pago parcial, con lo que falta y el total, sin emails
  await page.getByRole('button', { name: 'Copiar pendientes' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Lista copiada (1 persona).' })).toBeVisible();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  // En Windows el portapapeles devuelve los saltos de línea como CRLF
  expect(clipboard.replace(/\r\n/g, '\n')).toBe(`${partialName}: 60 BOB\nTotal adeudado: 60 BOB`);
});
