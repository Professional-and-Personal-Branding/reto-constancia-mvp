import { defineConfig, devices } from '@playwright/test';

import base from './playwright.config';

/**
 * Capturas de pantalla de la guía de uso (docs/guia-plataforma.html).
 *
 *   npx playwright test -c playwright.guide.config.ts
 *
 * Arma un reto de demostración realista ("Reto Octubre 2026"), recorre cada pantalla y
 * guarda las imágenes en docs/guia-capturas/. También verifica lo que muestra cada
 * pantalla, así que sirve como evidencia de los casos de UI del catálogo de pruebas.
 */
export default defineConfig({
  ...base,
  testDir: './guide',
  outputDir: './test-results-guide',
  retries: 0,
  reporter: [['list']],
  use: {
    ...base.use,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    screenshot: 'off',
    trace: 'off',
  },
  projects: [
    { name: 'setup', testDir: './fixtures', testMatch: /auth\.setup\.ts/ },
    // Sistema en modo claro: la web sigue al sistema, así que las capturas salen en el tema
    // claro y no se confunden con la guía cuando esta se ve en oscuro.
    {
      name: 'guide',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, colorScheme: 'light' },
      dependencies: ['setup'],
    },
  ],
});
