# Pruebas de UI con Playwright — configuración y ejecución

Los recorridos manuales de la Parte 2 de [`test-cases.md`](./test-cases.md) están
automatizados con [Playwright](https://playwright.dev). Estas pruebas manejan un navegador
real contra la app desplegada localmente y cubren lo que las suites de API no pueden ver:
subida de archivos, estado de los formularios, selector de reto y textos en pantalla.

## 1. Instalación (una vez)

```bash
cd e2e
npm install
npx playwright install chromium      # descarga el navegador (~115 MB)
```

Requisitos previos: Node 20 o 22, Postgres levantado (`docker compose up -d postgres`) y el
seed aplicado (`cd backend && npm run prisma:seed`). Las pruebas entran con las credenciales
del seed (`admin@reto.local` y `ana@reto.local`).

En Linux, la primera vez conviene `npx playwright install --with-deps chromium` para que
instale también las librerías del sistema.

## 2. Ejecución

```bash
cd e2e
npm test                 # todos los recorridos, sin ventana
npm run test:headed      # con el navegador visible
npm run test:ui          # modo interactivo de Playwright (paso a paso, con time-travel)
npm run report           # abre el último informe HTML

npx playwright test tests/02-activity-upload.spec.ts     # un solo archivo
npx playwright test -g "regla de FC"                     # por nombre de prueba
npx playwright test --debug                              # inspector paso a paso
```

También corren dentro de la batería completa de la plataforma:

```bash
node scripts/run-tests.mjs               # incluye los recorridos de UI
node scripts/run-tests.mjs --skip-ui     # los omite
```

**No hace falta levantar los servidores a mano.** La configuración usa `webServer`: si la
API (`:3002`) o el frontend (`:3005`) no responden, Playwright los arranca con
`npm run start:prod` y `npm run start`, y los apaga al terminar. Si ya los tienes corriendo,
los reutiliza. Eso sí, ambos deben estar **compilados** (`npm run build` en cada proyecto);
la batería completa se encarga de eso antes de llegar a este paso.

Variables opcionales:

| Variable | Por defecto | Para qué |
|---|---|---|
| `E2E_BASE_URL` | `http://localhost:3005` | Apuntar a otro frontend (por ejemplo, el desplegado) |
| `E2E_API_URL` | `http://localhost:3002/api` | Apuntar a otra API |
| `CI` | — | Activa reintentos, informe de GitHub y fuerza arrancar servidores nuevos |

## 3. Qué cubre cada archivo

| Archivo | Recorrido de `test-cases.md` | Casos |
|---|---|---|
| `tests/01-auth-navigation.spec.ts` | 1 · Alta, sesión y rutas protegidas | TC-AUTH-02, TC-AUTH-04, TC-UI-01, TC-UI-02 |
| `tests/02-activity-upload.spec.ts` | 3 · Registrar actividad con regla de FC | TC-ACT-01, 02, 05, 13, 14, 18, TC-UP-02, TC-UI-04 |
| `tests/03-admin-validation.spec.ts` | 4 · Validar y rechazar como admin | TC-ACT-08, TC-ACT-15 |
| `tests/04-finance.spec.ts` | 5 · Pagos y resumen financiero | TC-PART-04, TC-FIN-01, 02, 04, 05 |
| `tests/05-challenges-scoring.spec.ts` | 6 y 7 · Varios retos activos y reglas de puntaje | TC-CHAL-08, TC-CHAL-10, TC-SCORE-05 |
| `tests/06-import.spec.ts` | 8 y 9 · Importación por archivo y Google Sheets | TC-IMP-01, 02, 03, 05, TC-ACT-16 |

`tests/02` es el único lugar donde se prueba la subida de archivos de punta a punta:
formulario → `POST /upload/sign` → simulador local → registro de la actividad.

## 4. Cómo están construidas

**Sesión.** `fixtures/auth.setup.ts` es un proyecto previo que inicia sesión **una sola vez
por rol** y guarda el estado del navegador en `e2e/.auth/`. El login está limitado a cinco
intentos por minuto por IP: si cada prueba se autenticara, la suite se caería con `429`.
Cada spec declara qué estado usa con `test.use({ storageState: STATE.admin })`.

**Datos.** `fixtures/api.ts` prepara por API lo que cada recorrido necesita (retos,
inscripciones, actividades) en el **año 2025**, reservado para estas pruebas y ajeno a los
datos del seed. Cada spec usa un mes distinto, así no se pisan entre sí, y cierra su reto en
`afterAll`. El año está en el pasado a propósito: el formulario de subida no acepta fechas
futuras.

**Selección de reto.** `fixtures/ui.ts` fija el reto en `localStorage` antes de navegar, en
vez de depender del orden de los retos activos. Eso hace las pruebas deterministas aunque en
la base haya otros retos abiertos.

**Serie, no paralelo.** La configuración usa un solo worker: comparten base de datos, y en
serie el resultado es reproducible. La suite completa tarda unos 20 segundos.

## 5. Integración continua

El workflow tiene un tercer job, **E2E de UI (Playwright)**, que levanta Postgres, instala
dependencias, aplica migraciones, siembra, compila backend y frontend, instala Chromium y
corre los recorridos. Si algo falla, sube el informe HTML como artefacto `playwright-report`
(se descarga desde la pestaña Actions y se abre con `npx playwright show-report`).

## 6. Diagnóstico

| Síntoma | Causa | Salida |
|---|---|---|
| `Process from config.webServer was not able to start` | Falta compilar backend o frontend | `cd backend && npm run build` y `cd frontend && npm run build` |
| `429 Too Many Requests` al iniciar sesión | Se agotaron los 5 logins por minuto | Espera un minuto; no agregues logins fuera de `auth.setup.ts` |
| Una prueba no encuentra un texto | Cambió una etiqueta de la UI | Abre el informe (`npm run report`) y usa la traza para ver el DOM del fallo |
| Falla solo en CI | Diferencia de zona horaria o de datos | La configuración fija `America/La_Paz` y `es-BO`; revisa que el seed haya corrido |
| Datos raros tras una corrida interrumpida | Quedó un reto del año 2025 abierto | `cd backend && npx prisma migrate reset && npm run prisma:seed` |

## 7. Al agregar una prueba

1. Elige el archivo del recorrido correspondiente o crea uno nuevo con prefijo numérico.
2. Declara el rol con `test.use({ storageState: STATE.admin })` (o `participant`).
3. Prepara los datos con las funciones de `fixtures/api.ts` en un `beforeAll`, usando un mes
   libre del año 2025, y ciérralo en `afterAll` con `closeChallenge`.
4. Prefiere roles y etiquetas accesibles (`getByRole`, `getByLabel`) sobre selectores CSS: si
   un control no es alcanzable así, probablemente le falte una etiqueta y conviene
   arreglarlo en la app.
5. Actualiza la tabla de la sección 3 y, si el recorrido es nuevo, la Parte 2 de
   `test-cases.md`.
