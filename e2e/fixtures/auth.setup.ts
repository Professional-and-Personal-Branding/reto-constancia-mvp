import { mkdirSync, writeFileSync } from 'node:fs';

import { expect, test as setup } from '@playwright/test';

import { AUTH_DIR, SEED, STATE } from './api';

/**
 * Inicia sesión una sola vez por rol y guarda el estado del navegador y los tokens.
 *
 * El endpoint de login está limitado a 5 intentos por minuto por IP: si cada prueba se
 * autenticara, la suite se rompería con 429. Aquí se hacen exactamente dos logins y todo
 * lo demás reutiliza el estado guardado.
 */
async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/dashboard');
  await expect(page.getByRole('link', { name: 'Mi reto' })).toBeVisible();

  return page.evaluate(() => {
    const raw = window.localStorage.getItem('reto.tokens');
    return raw ? (JSON.parse(raw) as { accessToken: string }).accessToken : '';
  });
}

async function whoAmI(token: string): Promise<string> {
  const apiUrl = process.env.E2E_API_URL ?? 'http://localhost:3002/api';
  const res = await fetch(`${apiUrl}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  const body = (await res.json()) as { id: string };
  return body.id;
}

setup('autenticar admin y participante', async ({ page }) => {
  mkdirSync(AUTH_DIR, { recursive: true });

  const adminToken = await signIn(page, SEED.admin.email, SEED.admin.password);
  await page.context().storageState({ path: STATE.admin });

  await page.context().clearCookies();
  await page.evaluate(() => window.localStorage.clear());

  const participantToken = await signIn(page, SEED.participant.email, SEED.participant.password);
  await page.context().storageState({ path: STATE.participant });

  writeFileSync(
    STATE.tokens,
    JSON.stringify(
      {
        admin: adminToken,
        participant: participantToken,
        adminId: await whoAmI(adminToken),
        participantId: await whoAmI(participantToken),
      },
      null,
      2,
    ),
  );
});
