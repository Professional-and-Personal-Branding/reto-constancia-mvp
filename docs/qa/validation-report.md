# Reporte de validación de casos de prueba

- **Fecha:** 2026-10-02 00:37 (UTC)
- **Código:** rama `feature/web-light-theme`, commit `0b842c8` (con cambios sin commit)
- **Entorno:** Node v22.23.1, win32; API http://localhost:3002/api; Postgres local (Docker, puerto 5433)
- **Comando:** `node scripts/validate-test-cases.mjs --reuse`

## Resultado

**98 de 99 casos aprobados**; 0 fallidos, 0 con enlace roto, 0 sin ejecutar y 1 con limitación conocida.

Se ejecutaron **322 pruebas** automatizadas: 322 pasaron y 0 fallaron.

## Suites ejecutadas

| Suite | Ubicación | Pruebas | Pasan | Fallan | Duración | Ejecutada (UTC) |
|---|---|---:|---:|---:|---:|---|
| Unitarias (Jest) | `backend/src/**/*.spec.ts` | 121 | 121 | 0 | 5.6 s | 2026-10-02 00:33 |
| Unitarias de la web (node:test) | `frontend/lib/*.test.ts` | 12 | 12 | 0 | 476 ms | 2026-10-02 00:33 |
| API e2e (Jest + supertest) | `backend/test/*.e2e-spec.ts` | 81 | 81 | 0 | 8.4 s | 2026-10-02 00:33 |
| Recorridos de UI (Playwright) | `e2e/tests/*.spec.ts` | 29 | 29 | 0 | 28.1 s | 2026-10-02 00:34 |
| Capturas de la guía (Playwright) | `e2e/guide/capture.spec.ts` | 15 | 15 | 0 | 20.2 s | 2026-10-02 00:34 |
| Sesiones paralelas (script) | `scripts/parallel-session-test.mjs` | 64 | 64 | 0 | 961 ms | 2026-10-02 00:34 |

## Casos por prioridad

| Prioridad | Casos | Aprobados | Fallidos |
|---|---:|---:|---:|
| Alta | 62 | 62 | 0 |
| Media | 36 | 35 | 0 |
| Baja | 1 | 1 | 0 |

## Casos por tipo

| Tipo | Casos |
|---|---:|
| Funcional | 45 |
| Seguridad | 19 |
| Negativo | 15 |
| Regresión | 6 |
| UI | 9 |
| Observación | 1 |
| Integración | 4 |

## Casos que requieren atención

| Caso | Estado | Detalle |
|---|---|---|
| TC-CHAL-12 · Consultar en la web el ranking de un reto cerrado | 🟡 Limitación conocida | Observado al generar las capturas de la guía; documentado como OBS-01 en el reporte y en el paso 6.3 de la guía |

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

## Observaciones abiertas

| ID | Observación | Casos |
|---|---|---|
| OBS-01 | **El ranking de un reto cerrado no se puede consultar en la web.** El selector de reto solo lista retos activos. Tras cerrar un reto, su resultado final (ganadores y premio) solo se consulta por GET /api/challenges/:id/results. Propuesta: listar los retos cerrados en el selector del ranking. | TC-CHAL-12 |
| OBS-02 | **Funciones disponibles solo por API.** Editar las reglas de un reto, retirar una actividad pendiente y registrar un pago parcial no tienen botón en la web; la guía los documenta por API. | TC-CHAL-05, TC-ACT-12, TC-FIN-01 |

## Pruebas sin caso asociado

Todas las pruebas ejecutadas están enlazadas a algún caso del catálogo.
