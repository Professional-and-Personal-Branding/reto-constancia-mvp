import { expect, test } from '@playwright/test';

import { closeChallenge, E2E_YEAR, enroll, setupChallenge, STATE, tokens } from '../fixtures/api';

/**
 * Recorridos 8 y 9 de docs/test-cases.md: importación masiva y sección de Google Sheets.
 * Casos cubiertos: TC-IMP-01, TC-IMP-02, TC-IMP-03, TC-IMP-05, TC-ACT-16.
 */
const MONTH = 9;

test.use({ storageState: STATE.admin });

test.beforeAll(async () => {
  const challenge = await setupChallenge({
    month: MONTH,
    name: 'E2E Playwright · importación',
    minHeartRateMinutes: 20,
  });
  await enroll(challenge.id, tokens().participantId);
});

test.afterAll(async () => {
  await closeChallenge(MONTH);
});

test('la plantilla se descarga con la columna de minutos de FC', async ({ page }) => {
  await page.goto('/dashboard/admin/import');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Descargar CSV' }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  expect(Buffer.concat(chunks).toString('utf8')).toContain('heartRateMinutes');
});

test('previsualiza con advertencias de FC e importa las filas válidas', async ({ page }) => {
  await page.goto('/dashboard/admin/import');

  const header =
    'email,name,challengeMonth,challengeYear,date,exerciseType,durationMinutes,distanceKm,avgHeartRate,heartRateMinutes,hasHeartRateProof,status,notes,photoUrl';
  const rows = [
    `ana@reto.local,Ana,${MONTH},${E2E_YEAR},${E2E_YEAR}-0${MONTH}-15,RUNNING,40,5,140,30,true,PENDING,e2e ok,`,
    `ana@reto.local,Ana,${MONTH},${E2E_YEAR},${E2E_YEAR}-0${MONTH}-16,RUNNING,40,5,140,,false,PENDING,e2e sin fc,`,
  ];
  const csv = [header, ...rows].join('\n');

  // La página tiene dos secciones con botones homónimos (archivo y Google Sheets)
  const fileSection = page.locator('section').filter({ hasText: '2. Subir archivo' });
  await page.locator('input[type="file"]').setInputFiles({
    name: 'e2e-import.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  });

  await fileSection.getByRole('button', { name: 'Previsualizar' }).click();

  const preview = page.locator('section').filter({ hasText: 'Previsualización' });
  await expect(preview).toContainText('2 válidas');
  await expect(preview).toContainText(/regla de FC/i);

  await fileSection.getByRole('button', { name: /Importar/ }).click();

  const result = page.locator('section').filter({ hasText: 'Importación completada' });
  await expect(result).toBeVisible();
  await expect(result).toContainText('2');
});

test('la sección de Google Sheets explica que falta configurarla', async ({ page }) => {
  await page.goto('/dashboard/admin/import');

  const sheets = page.getByLabel('Importar desde Google Sheets');
  await expect(sheets).toContainText('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  await expect(sheets.getByLabel('Spreadsheet ID')).toBeDisabled();
  await expect(sheets.getByRole('button', { name: 'Comprobar' })).toBeDisabled();

  // La carga por archivo sigue disponible
  await expect(page.getByRole('button', { name: 'Descargar CSV' })).toBeEnabled();
});
