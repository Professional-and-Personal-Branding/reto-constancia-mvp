# Reporte de validación de casos de prueba

- **Fecha:** 2026-10-06 06:25 (UTC)
- **Código:** rama `feature/upload-asset-cleanup`, commit `8a772c0`
- **Entorno:** Node v22.23.1, win32; API http://localhost:3002/api; Postgres local (Docker, puerto 5433)
- **Comando:** `node scripts/validate-test-cases.mjs`

## Resultado

**130 de 130 casos aprobados**; 0 fallidos, 0 con enlace roto, 0 sin ejecutar y 0 con limitación conocida.

Se ejecutaron **568 pruebas** automatizadas: 568 pasaron y 0 fallaron.

## Suites ejecutadas

| Suite | Ubicación | Pruebas | Pasan | Fallan | Duración | Ejecutada (UTC) |
|---|---|---:|---:|---:|---:|---|
| Unitarias (Jest) | `backend/src/**/*.spec.ts` | 276 | 276 | 0 | 8.2 s | 2026-10-06 06:24 |
| Unitarias de la web (node:test) | `frontend/lib/*.test.ts` | 16 | 16 | 0 | 689 ms | 2026-10-06 06:24 |
| API e2e (Jest + supertest) | `backend/test/*.e2e-spec.ts` | 127 | 127 | 0 | 18.3 s | 2026-10-06 06:24 |
| Recorridos de UI (Playwright) | `e2e/tests/*.spec.ts` | 60 | 60 | 0 | 45.0 s | 2026-10-06 06:25 |
| Capturas de la guía (Playwright) | `e2e/guide/capture.spec.ts` | 19 | 19 | 0 | 23.1 s | 2026-10-06 06:25 |
| Sesiones paralelas (script) | `scripts/parallel-session-test.mjs` | 70 | 70 | 0 | 1.1 s | 2026-10-06 06:25 |

## Casos por prioridad

| Prioridad | Casos | Aprobados | Fallidos |
|---|---:|---:|---:|
| Alta | 86 | 86 | 0 |
| Media | 43 | 43 | 0 |
| Baja | 1 | 1 | 0 |

## Casos por tipo

| Tipo | Casos |
|---|---:|
| Funcional | 57 |
| Seguridad | 35 |
| Negativo | 16 |
| Regresión | 7 |
| UI | 11 |
| Integración | 4 |

## Casos que requieren atención

Ninguno.

## Pruebas fallidas

Ninguna.

## Defectos encontrados en esta versión

| ID | Severidad | Estado | Defecto | Casos que lo cubren |
|---|---|---|---|---|
| DEF-01 | Alta | Corregido | **La importación CSV dañaba acentos y eñes.** Un CSV en UTF-8 se leía como Latin-1: "Olvidé el reloj" llegaba como "OlvidÃ© el reloj" (también "Ana Pérez" de la plantilla). Ahora los CSV se decodifican como UTF-8 (con o sin BOM) y los XLSX se leen como binario. | TC-IMP-09 |
| DEF-02 | Alta | Corregido | **Un pico de tráfico cerraba la sesión de los usuarios.** La web cerraba la sesión ante cualquier error de /auth/me, incluido un 429 del limitador. Detrás de un proxy, además, todos los usuarios compartían el cupo de 100 peticiones por minuto. Ahora la web reintenta y solo un 401 cierra la sesión; la API confía en el proxy (TRUST_PROXY) y el límite es configurable. | TC-AUTH-13, TC-SEC-03 |
| DEF-03 | Media | Corregido | **El tope se mostraba en días aunque el reto puntuara en puntos.** El ranking decía "top actual: 96 días" y el aviso de empate usaba "días" con reglas de puntaje propias. Ahora la unidad sigue las reglas del reto. | TC-SCORE-07 |
| DEF-04 | Media | Corregido | **El panel de premiación sugería a los empatados por días.** Sugería a quienes empataban en días validados, ignorando puntaje, mínimo para calificar y número de ganadores. Ahora sugiere los ganadores que calcula el servidor con las reglas del reto. | TC-RES-06 |
| DEF-05 | Alta | Corregido | **Cambiar de página mientras se renovaba el token cerraba la sesión.** En frontend/lib/api.ts cualquier error durante la renovación o el reintento posterior (un corte de red, una navegación que aborta la petición, un 429 o 5xx del refresh) borraba los tokens y enviaba al login. Lo detectó la nueva prueba de TC-AUTH-10 al correr la suite completa: consultas en segundo plano renovaban el token y la recarga abortaba sus reintentos. Ahora solo un rechazo del refresh token (400/401/403) cierra la sesión; se confirmó que la prueba de TC-AUTH-14 falla con el código anterior y pasa con la corrección. | TC-AUTH-14, TC-AUTH-10 |
| DEF-06 | Media | Corregido | **El encabezado no entraba: nombre del reto cortado y controles fuera de pantalla en móvil.** El encabezado era una sola fila. Con las siete secciones del administrador el selector cortaba el nombre del reto ("Reto Octubre 2026 (no ins…"), y en móvil el selector, el interruptor de tema y "Salir" quedaban fuera de la pantalla para ambos roles. Ahora la marca y los controles van arriba y las secciones en una fila propia que se desplaza; el participante en escritorio conserva una sola fila. La prueba de TC-UI-10 falla con el encabezado anterior. | TC-UI-10 |

## Observaciones

| ID | Estado | Observación | Casos |
|---|---|---|---|
| OBS-01 | Resuelta | **El ranking de un reto cerrado no se podía consultar en la web.** El selector de reto solo lista retos activos, así que el resultado final de un reto cerrado solo se veía por GET /api/challenges/:id/results. Resuelta con el cambio closed-challenge-results: el Ranking ofrece los retos cerrados, con dirección para compartir y en solo lectura. | TC-CHAL-12 |
| OBS-02 | Resuelta | **Funciones disponibles solo por API.** Editar las reglas de un reto, retirar una actividad pendiente y registrar un pago parcial no tenían botón en la web. Resuelta con el cambio web-api-only-actions: los tres tienen su control en la web. | TC-CHAL-05, TC-ACT-12, TC-FIN-01 |
| OBS-03 | Resuelta | **La API permitía editar o reabrir un reto cerrado.** PATCH aceptaba cambiar las reglas de un reto cerrado (reescribiendo su ranking y ganadores) y devolverlo a borrador. Resuelta con el cambio web-api-only-actions: un reto cerrado es definitivo (400) salvo registrar su premiación; las herramientas de prueba borran sus retos de prueba en la base local en vez de reabrirlos. | TC-CHAL-13 |

## Pruebas sin caso asociado

Todas las pruebas ejecutadas están enlazadas a algún caso del catálogo.
