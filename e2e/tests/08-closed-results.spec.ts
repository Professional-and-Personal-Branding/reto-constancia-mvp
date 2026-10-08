import { expect, test } from '@playwright/test';

import { api, createActivity, E2E_YEAR, e2eDate, enroll, markPaid, setupChallenge, STATE, tokens } from '../fixtures/api';

/**
 * Resultados de retos cerrados en el Ranking (spec challenge-lifecycle, closed-challenge-results).
 * Casos cubiertos: TC-CHAL-12 y TC-CHAL-22 (acta en CSV).
 */
const MONTH = 11;
const NAME = 'E2E Playwright · reto cerrado';

let challengeId = '';

test.beforeAll(async () => {
  const { admin, participantId } = tokens();
  const challenge = await setupChallenge({ month: MONTH, name: NAME, feePerParticipant: 300 });
  challengeId = challenge.id;
  await enroll(challengeId, participantId);
  // Ana paga su cuota: lo recaudado (el pote del premio) es 300. Después del cierre ya no se puede.
  await markPaid(challengeId, participantId, true);

  // Una actividad validada de Ana y la premiación, que cierra el reto
  const activity = await createActivity(challengeId, e2eDate(MONTH, 3), { distanceKm: 8 });
  await api('POST', `/activities/${activity.id}/validate`, { token: admin });
  const award = await api('POST', `/challenges/${challengeId}/awards`, {
    token: admin,
    body: { userIds: [participantId], notes: 'Premio entregado en la reunión del grupo' },
  });
  expect([200, 201]).toContain(award.status);
});

test.describe('Participante', () => {
  test.use({ storageState: STATE.participant });

  test('un reto cerrado muestra su ranking final, los ganadores y el premio final', async ({ page }) => {
    await page.goto('/dashboard/results');
    const picker = page.getByLabel('Retos cerrados');
    await expect(picker).toBeVisible();
    await picker.selectOption({ label: NAME });

    await expect(page).toHaveURL(new RegExp(`\\?reto=${challengeId}`));
    await expect(page.locator('main')).toContainText(`${NAME} · cerrado el`);
    await expect(page.locator('main')).toContainText('top final:');
    const winners = page.locator('.card').filter({ hasText: /Ganador/ });
    await expect(winners).toContainText('Ana Constante');
    const prize = page.getByLabel('Premio por ganador');
    await expect(prize).toContainText('300 BOB por ganador');
    await expect(prize).not.toContainText('proyectado');
  });

  test('abrir un reto cerrado no cambia el reto activo del encabezado', async ({ page }) => {
    await page.goto('/dashboard/results');
    await expect(page.getByRole('heading', { name: 'Ranking' })).toBeVisible();
    const eyebrow = page.getByRole('heading', { name: 'Ranking' }).locator('xpath=preceding-sibling::p[1]');
    const activeName = (await eyebrow.textContent())?.trim();
    const storedBefore = await page.evaluate(() => window.localStorage.getItem('reto.selectedChallengeId'));

    await page.getByLabel('Retos cerrados').selectOption({ label: NAME });
    await expect(page.locator('main')).toContainText(`${NAME} · cerrado el`);
    await page.getByRole('link', { name: 'Volver al reto activo' }).click();

    await expect(page).toHaveURL(/\/dashboard\/results$/);
    await expect(eyebrow).toHaveText(activeName ?? '');
    expect(await page.evaluate(() => window.localStorage.getItem('reto.selectedChallengeId'))).toBe(storedBefore);
  });

  test('la dirección de un reto cerrado se puede compartir', async ({ page }) => {
    await page.goto(`/dashboard/results?reto=${challengeId}`);
    await expect(page.locator('main')).toContainText(`${NAME} · cerrado el`);
    await expect(page.locator('.card').filter({ hasText: /Ganador/ })).toContainText('Ana Constante');
  });

  test('el participante no ve la descarga del acta', async ({ page }) => {
    await page.goto(`/dashboard/results?reto=${challengeId}`);
    await expect(page.locator('main')).toContainText(`${NAME} · cerrado el`);
    await expect(page.getByRole('button', { name: /Descargar acta/ })).toHaveCount(0);
  });

  test('una dirección con un reto desconocido muestra el ranking activo', async ({ page }) => {
    await page.goto('/dashboard/results?reto=no-existe');
    await expect(page.getByRole('heading', { name: 'Ranking' })).toBeVisible();
    await expect(page.locator('main')).not.toContainText('· cerrado el');
  });

  test('sin reto activo, el ranking ofrece los retos cerrados', async ({ page }) => {
    // Se simula que no hay retos activos; los cerrados vienen de la API real
    await page.route('**/api/challenges/active/list', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    );
    await page.goto('/dashboard/results');
    await expect(page.locator('main')).toContainText('Sin reto activo');
    await page.getByRole('link', { name: NAME }).click();
    await expect(page).toHaveURL(new RegExp(`\\?reto=${challengeId}`));
    await expect(page.locator('.card').filter({ hasText: /Ganador/ })).toContainText('Ana Constante');
  });
});

test.describe('Administrador', () => {
  test.use({ storageState: STATE.admin });

  test('el acta del reto cerrado se descarga en CSV con el ranking, el pago y el premio', async ({ page }) => {
    await page.goto(`/dashboard/results?reto=${challengeId}`);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Descargar acta (CSV)' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(`acta-reto-${E2E_YEAR}-${MONTH}.csv`);
    const stream = await download.createReadStream();
    let text = '';
    for await (const chunk of stream) text += chunk.toString('utf8');
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const rows = text.slice(1).split('\r\n').filter(Boolean);
    expect(rows[0]).toContain('reto,periodo,moneda,cuota,pote,posicion,nombre,email');
    const ana = rows.find((r) => r.includes('Ana Constante'));
    expect(ana).toBeTruthy();
    expect(ana).toContain(`${NAME},${E2E_YEAR}-${MONTH},BOB,300.00,300.00,1,Ana Constante,ana@reto.local`);
    expect(ana).toContain(',pagado,300.00,');
    expect(ana?.endsWith(',si,Premio entregado en la reunión del grupo,300.00')).toBe(true);
    await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
  });

  test('si la descarga falla, el error se ve junto al botón', async ({ page }) => {
    await page.route('**/api/challenges/*/export*', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Solo se puede exportar el acta de un reto cerrado' }),
      }),
    );
    await page.goto(`/dashboard/results?reto=${challengeId}`);
    await page.getByRole('button', { name: 'Descargar acta (CSV)' }).click();
    await expect(page.locator('main').getByRole('alert')).toContainText('Solo se puede exportar el acta de un reto cerrado');
  });

  test('un reto cerrado se consulta en solo lectura, sin panel de premiación', async ({ page }) => {
    await page.goto(`/dashboard/results?reto=${challengeId}`);
    await expect(page.locator('main')).toContainText(`${NAME} · cerrado el`);
    await expect(page.getByRole('button', { name: /Guardar premiación/ })).toHaveCount(0);

    // En el ranking del reto activo el panel sigue disponible
    await page.goto('/dashboard/results');
    await expect(page.getByRole('button', { name: /Guardar premiación/ })).toBeVisible();
  });
});
