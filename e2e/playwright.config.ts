import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas end-to-end de la plataforma con Playwright.
 *
 * Cubren los recorridos manuales de la Parte 2 de docs/test-cases.md sobre la UI real,
 * incluyendo lo que las suites de API no pueden verificar: subida de archivos, estado de
 * formularios y persistencia de la selección de reto.
 *
 * Ejecución y configuración: docs/e2e-playwright.md
 */
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3005';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3002/api';

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  // Los datos viven en una base compartida: se corre en serie para que los recorridos no
  // se pisen entre sí. Cada spec crea y limpia su propio reto (año 2095).
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }], ['github']]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 15_000,
    locale: 'es-BO',
    timezoneId: 'America/La_Paz',
    extraHTTPHeaders: { 'x-e2e': 'playwright' },
  },

  projects: [
    // Inicia sesión una sola vez por rol y guarda el estado: el login está limitado a
    // 5 intentos por minuto, así que las pruebas no vuelven a autenticarse.
    { name: 'setup', testDir: './fixtures', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],

  // En local reutiliza los servidores que ya tengas levantados; en CI los arranca.
  webServer: [
    {
      command: 'npm run start:prod',
      cwd: '../backend',
      url: `${API_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: { CORS_ORIGIN: BASE_URL, NODE_ENV: process.env.NODE_ENV ?? 'test' },
    },
    {
      command: 'npm run start',
      cwd: '../frontend',
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
