import { expect, test } from '@playwright/test';

import { api, createActivity, e2eDate, enroll, markPaid, setupChallenge, STATE, tokens } from '../fixtures/api';

/**
 * Resultados de retos cerrados en el Ranking (spec challenge-lifecycle, closed-challenge-results).
 * Casos cubiertos: TC-CHAL-12.
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

  test('un reto cerrado se consulta en solo lectura, sin panel de premiación', async ({ page }) => {
    await page.goto(`/dashboard/results?reto=${challengeId}`);
    await expect(page.locator('main')).toContainText(`${NAME} · cerrado el`);
    await expect(page.getByRole('button', { name: /Guardar premiación/ })).toHaveCount(0);

    // En el ranking del reto activo el panel sigue disponible
    await page.goto('/dashboard/results');
    await expect(page.getByRole('button', { name: /Guardar premiación/ })).toBeVisible();
  });
});
