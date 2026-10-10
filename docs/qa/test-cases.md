# Catálogo de casos de prueba

> Documento generado por `node scripts/validate-test-cases.mjs` a partir de [catalog.mjs](catalog.mjs). No lo edites a mano: cambia el catálogo y vuelve a validar.
> Última validación: **2026-10-10** · rama `feature/payment-reconciliation` · commit `58f6a7f` (con cambios sin commit). Detalle en [validation-report.md](validation-report.md).

**135 casos** · 135 aprobados · 0 fallidos · 0 con limitación conocida · 134 automatizados.

## Cómo leer cada caso

- **Prioridad:** Alta (bloquea el reto: sesión, registro, validación, ranking, dinero), Media (función secundaria o error manejado), Baja (documentación o detalle visual).
- **Tipo:** Funcional, Negativo (entrada inválida), Seguridad (acceso y configuración), UI, Integración (servicios externos o varias piezas), Regresión (protege un defecto corregido) u Observación (limitación conocida).
- **Paso de la guía:** el paso de [guia-plataforma.html](../guia-plataforma.html) donde se usa la función.
- **Validación automatizada:** cada fila es una prueba real; el caso se aprueba solo si todas pasan en la última validación.
- **Datos de partida:** seed de desarrollo (`admin@reto.local`, participantes ana, bruno, carla, diego y elena `@reto.local`, contraseña `ChangeMe123!` para todas). Reto Mayo 2026: 2026-05-01 a 2026-05-31, lunes a sábado, cuota 120 BOB, presupuesto 600 BOB, mínimo de FC 20 min. Para no tocar ese reto, cada suite crea los suyos en otro período: API e2e en 2094–2200, recorridos de UI en 2025, guía en octubre de 2026 y sesiones paralelas en 2030.

## Índice

| Módulo | Casos | Aprobados | Otros |
|---|---:|---:|---:|
| [Autenticación y sesión](#auth) | 14 | 14 | 0 |
| [Seguridad y configuración](#sec) | 13 | 13 | 0 |
| [Gestión de retos](#chal) | 22 | 22 | 0 |
| [Participantes y pagos](#part) | 7 | 7 | 0 |
| [Actividades y validación](#act) | 19 | 19 | 0 |
| [Resultados y premiación](#res) | 6 | 6 | 0 |
| [Reglas de puntaje](#score) | 7 | 7 | 0 |
| [Finanzas](#fin) | 9 | 9 | 0 |
| [Carga de archivos](#up) | 9 | 9 | 0 |
| [Importación masiva](#imp) | 12 | 12 | 0 |
| [Interfaz y navegación](#ui) | 11 | 11 | 0 |
| [Salud del servicio](#health) | 5 | 5 | 0 |
| [Sesiones concurrentes](#par) | 1 | 1 | 0 |

<a id="auth"></a>

## Autenticación y sesión

| ID | Caso | Prioridad | Tipo | Estado |
|---|---|---|---|---|
| [TC-AUTH-01](#tc-auth-01) | Registro de participante | Alta | Funcional | ✅ Aprobado |
| [TC-AUTH-02](#tc-auth-02) | Política de contraseña | Alta | Seguridad | ✅ Aprobado |
| [TC-AUTH-03](#tc-auth-03) | Email ya registrado | Media | Negativo | ✅ Aprobado |
| [TC-AUTH-04](#tc-auth-04) | Inicio de sesión correcto | Alta | Funcional | ✅ Aprobado |
| [TC-AUTH-05](#tc-auth-05) | Contraseña incorrecta | Alta | Seguridad | ✅ Aprobado |
| [TC-AUTH-06](#tc-auth-06) | Perfil de la sesión | Alta | Funcional | ✅ Aprobado |
| [TC-AUTH-07](#tc-auth-07) | Acceso sin token | Alta | Seguridad | ✅ Aprobado |
| [TC-AUTH-08](#tc-auth-08) | Renovar la sesión con el refresh token | Alta | Funcional | ✅ Aprobado |
| [TC-AUTH-09](#tc-auth-09) | Límite de intentos de login | Alta | Seguridad | ✅ Aprobado |
| [TC-AUTH-10](#tc-auth-10) | Access token vencido: renovación transparente en la web | Alta | Funcional | ✅ Aprobado |
| [TC-AUTH-11](#tc-auth-11) | Cuenta inactiva no inicia sesión | Media | Seguridad | ✅ Aprobado |
| [TC-AUTH-12](#tc-auth-12) | Refresh token inválido | Media | Seguridad | ✅ Aprobado |
| [TC-AUTH-13](#tc-auth-13) | Un 429 transitorio no cierra la sesión | Alta | Regresión | ✅ Aprobado |
| [TC-AUTH-14](#tc-auth-14) | Un corte de red al renovar el token no cierra la sesión | Alta | Regresión | ✅ Aprobado |

<a id="tc-auth-01"></a>

### TC-AUTH-01 · Registro de participante

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Autenticación y sesión | Alta | Funcional | 1.1 | ✅ Aprobado |

**Precondiciones**

- El email no está registrado.

**Datos de prueba:** name "Test User", email test1@reto.local, password Passw0rd1

**Pasos**

1. Abrir /register.
2. Completar nombre, email y contraseña válida.
3. Pulsar Crear cuenta (POST /api/auth/register).

**Resultado esperado**

- 201 con { user, tokens }.
- user.role = PARTICIPANT y la respuesta no incluye passwordHash.
- La web inicia sesión y redirige a /dashboard.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `auth.service.spec.ts` | register crea usuario y no expone passwordHash |
| ✅ | API e2e | `app.e2e-spec.ts` | POST /api/auth/register crea participante |

<a id="tc-auth-02"></a>

### TC-AUTH-02 · Política de contraseña

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Autenticación y sesión | Alta | Seguridad | 1.1 | ✅ Aprobado |

**Precondiciones**

- Ninguna.

**Datos de prueba:** passwords "soloLetras" (sin número), "corta1" (menos de 8) y "12345678" (sin letra)

**Pasos**

1. Intentar registrarse con cada contraseña inválida.

**Resultado esperado**

- 400 en los tres casos: "La contraseña debe incluir al menos una letra y un número" o el mínimo de 8 caracteres.
- No se crea el usuario (el login posterior responde 401).
- La web muestra el error junto al formulario y no navega.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | AUTH: el registro rechaza contraseñas sin número (400) |
| ✅ | UI | `01-auth-navigation.spec.ts` | el registro exige una contraseña que cumpla la política |
| ✅ | Guía | `capture.spec.ts` | inicio de sesión y registro |

<a id="tc-auth-03"></a>

### TC-AUTH-03 · Email ya registrado

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Autenticación y sesión | Media | Negativo | 1.1 | ✅ Aprobado |

**Precondiciones**

- Existe una cuenta con el email a usar.

**Datos de prueba:** email ana@reto.local (o uno creado en la misma prueba)

**Pasos**

1. POST /api/auth/register con el email existente.

**Resultado esperado**

- 409 "Email ya registrado".
- La cuenta existente no cambia.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `auth.service.spec.ts` | register lanza ConflictException si el email ya existe |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | AUTH: el registro rechaza un email ya usado (409) |

<a id="tc-auth-04"></a>

### TC-AUTH-04 · Inicio de sesión correcto

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Autenticación y sesión | Alta | Funcional | 1.2 | ✅ Aprobado |

**Precondiciones**

- Cuenta activa.

**Datos de prueba:** admin@reto.local / ChangeMe123!

**Pasos**

1. POST /api/auth/login con email y contraseña.

**Resultado esperado**

- 200 con { user, tokens: { accessToken, refreshToken } }.
- user.role = ADMIN para el administrador.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `auth.service.spec.ts` | login válido devuelve tokens |
| ✅ | API e2e | `app.e2e-spec.ts` | POST /api/auth/login con credenciales correctas |
| ✅ | Sesiones | `parallel-session-test.mjs` | Admin obtiene token |
| ✅ | Sesiones | `parallel-session-test.mjs` | Ana (participante) obtiene token |

<a id="tc-auth-05"></a>

### TC-AUTH-05 · Contraseña incorrecta

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Autenticación y sesión | Alta | Seguridad | 1.2 | ✅ Aprobado |

**Precondiciones**

- Cuenta activa.

**Datos de prueba:** ana@reto.local / wrong

**Pasos**

1. POST /api/auth/login con contraseña errónea.

**Resultado esperado**

- 401 "Credenciales inválidas".
- El mensaje es el mismo exista o no el email (no revela cuentas).

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `auth.service.spec.ts` | login con password incorrecto lanza Unauthorized |
| ✅ | API e2e | `app.e2e-spec.ts` | POST /api/auth/login con password incorrecto -> 401 |

<a id="tc-auth-06"></a>

### TC-AUTH-06 · Perfil de la sesión

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Autenticación y sesión | Alta | Funcional | 1.2 | ✅ Aprobado |

**Precondiciones**

- Sesión iniciada.

**Datos de prueba:** Authorization: Bearer <accessToken>

**Pasos**

1. GET /api/auth/me.

**Resultado esperado**

- 200 con el perfil (id, name, email, role) sin passwordHash.
- El rol corresponde a la cuenta: ADMIN o PARTICIPANT.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `app.e2e-spec.ts` | GET /api/auth/me devuelve el perfil autenticado |
| ✅ | Sesiones | `parallel-session-test.mjs` | Sesión admin -> rol ADMIN |
| ✅ | Sesiones | `parallel-session-test.mjs` | Sesión Ana -> rol PARTICIPANT |

<a id="tc-auth-07"></a>

### TC-AUTH-07 · Acceso sin token

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Autenticación y sesión | Alta | Seguridad | 1.3 | ✅ Aprobado |

**Precondiciones**

- Ninguna.

**Datos de prueba:** Sin cabecera Authorization

**Pasos**

1. GET /api/auth/me (y cualquier endpoint protegido) sin token.

**Resultado esperado**

- 401 en todos los endpoints protegidos.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `app.e2e-spec.ts` | rechaza acceso sin token (401) |
| ✅ | Sesiones | `parallel-session-test.mjs` | Sin token -> 401 |

<a id="tc-auth-08"></a>

### TC-AUTH-08 · Renovar la sesión con el refresh token

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Autenticación y sesión | Alta | Funcional | 1.2 | ✅ Aprobado |

**Precondiciones**

- Sesión iniciada.

**Datos de prueba:** { refreshToken } emitido en el login

**Pasos**

1. POST /api/auth/refresh con el refresh token.
2. Usar el accessToken nuevo en GET /api/auth/me.

**Resultado esperado**

- Respuesta exitosa con accessToken y refreshToken nuevos.
- El accessToken nuevo autentica (200 en /auth/me).

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | AUTH: el refresh token emite un access token nuevo que funciona |

<a id="tc-auth-09"></a>

### TC-AUTH-09 · Límite de intentos de login

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Autenticación y sesión | Alta | Seguridad | 1.2 | ✅ Aprobado |

**Precondiciones**

- Misma IP, ventana de 1 minuto.

**Datos de prueba:** 7 intentos de login con contraseña incorrecta (más de 5 por minuto)

**Pasos**

1. Enviar 7 POST /api/auth/login seguidos.

**Resultado esperado**

- Mientras quede cupo responde 401.
- Al superar 5 intentos por minuto responde 429 Too Many Requests, y sigue en 429 en los intentos siguientes.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | AUTH: tras 5 intentos de login en un minuto responde 429 |

<a id="tc-auth-10"></a>

### TC-AUTH-10 · Access token vencido: renovación transparente en la web

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Autenticación y sesión | Alta | Funcional | 1.2 | ✅ Aprobado |

**Precondiciones**

- Sesión de administrador iniciada en la web.

**Datos de prueba:** accessToken con firma alterada en localStorage (equivale a vencido); luego también el refreshToken

**Pasos**

1. Abrir /dashboard con sesión.
2. Invalidar el accessToken guardado y recargar.
3. Repetir invalidando también el refreshToken.

**Resultado esperado**

- Con refresh válido: la web llama a /auth/refresh, guarda un token nuevo y sigue en /dashboard sin pedir login.
- Con refresh inválido: redirige a /login y borra los tokens guardados.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | UI | `01-auth-navigation.spec.ts` | un access token vencido se renueva solo con el refresh token |
| ✅ | UI | `01-auth-navigation.spec.ts` | si el refresh token también es inválido, vuelve al login y borra la sesión |

<a id="tc-auth-11"></a>

### TC-AUTH-11 · Cuenta inactiva no inicia sesión

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Autenticación y sesión | Media | Seguridad | 1.2 | ✅ Aprobado |

**Precondiciones**

- Usuario con isActive = false.

**Datos de prueba:** Credenciales correctas de la cuenta inactiva

**Pasos**

1. POST /api/auth/login.

**Resultado esperado**

- 401, igual que con credenciales inválidas.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `auth.service.spec.ts` | login de usuario inactivo lanza Unauthorized |

<a id="tc-auth-12"></a>

### TC-AUTH-12 · Refresh token inválido

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Autenticación y sesión | Media | Seguridad | 1.2 | ✅ Aprobado |

**Precondiciones**

- Ninguna.

**Datos de prueba:** refreshToken "no-es-un-token"

**Pasos**

1. POST /api/auth/refresh con un token inválido.

**Resultado esperado**

- 401.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | AUTH: un refresh token inválido se rechaza (401) |

<a id="tc-auth-13"></a>

### TC-AUTH-13 · Un 429 transitorio no cierra la sesión

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Autenticación y sesión | Alta | Regresión | 1.2 | ✅ Aprobado |

> Relacionado con DEF-02 (ver reporte de validación).

**Precondiciones**

- Sesión de administrador iniciada en la web.

**Datos de prueba:** Las dos primeras llamadas a /api/auth/me responden 429

**Pasos**

1. Abrir /dashboard mientras /auth/me responde 429 dos veces.

**Resultado esperado**

- La web reintenta con espera creciente y entra al dashboard.
- Los tokens siguen guardados; solo un 401 cierra la sesión.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | UI | `01-auth-navigation.spec.ts` | un 429 transitorio al cargar el perfil no cierra la sesión |

<a id="tc-auth-14"></a>

### TC-AUTH-14 · Un corte de red al renovar el token no cierra la sesión

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Autenticación y sesión | Alta | Regresión | 1.2 | ✅ Aprobado |

> Relacionado con DEF-05 (ver reporte de validación).

**Precondiciones**

- Sesión de administrador iniciada en la web.

**Datos de prueba:** accessToken invalidado; la primera llamada a /api/auth/refresh se corta (red caída); las siguientes llegan al servidor

**Pasos**

1. Invalidar el accessToken guardado.
2. Recargar /dashboard mientras la primera renovación falla por red.

**Resultado esperado**

- La sesión se conserva: la web reintenta, renueva el token y entra al dashboard.
- Solo un rechazo del servidor al refresh token (400/401/403) borra la sesión.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | UI | `01-auth-navigation.spec.ts` | un corte de red al renovar el token no cierra la sesión |
| ✅ | UI | `01-auth-navigation.spec.ts` | un access token vencido se renueva solo con el refresh token |

<a id="sec"></a>

## Seguridad y configuración

| ID | Caso | Prioridad | Tipo | Estado |
|---|---|---|---|---|
| [TC-SEC-01](#tc-sec-01) | Solo el administrador gestiona retos | Alta | Seguridad | ✅ Aprobado |
| [TC-SEC-02](#tc-sec-02) | CORS restringido en producción | Alta | Seguridad | ✅ Aprobado |
| [TC-SEC-03](#tc-sec-03) | Proxy de confianza y límite global configurable | Alta | Seguridad | ✅ Aprobado |
| [TC-SEC-04](#tc-sec-04) | El seed exige contraseña de admin en producción | Alta | Seguridad | ✅ Aprobado (manual) |
| [TC-SEC-05](#tc-sec-05) | La vigencia de los tokens se valida al arrancar | Alta | Seguridad | ✅ Aprobado |
| [TC-SEC-06](#tc-sec-06) | El ranking no expone emails ni estado de pago a participantes | Alta | Seguridad | ✅ Aprobado |
| [TC-SEC-07](#tc-sec-07) | La lista de retos activos no trae inscritos al participante y el pago propio va en me | Alta | Seguridad | ✅ Aprobado |
| [TC-SEC-08](#tc-sec-08) | El detalle del reto se proyecta por rol y el admin inscrito conserva su me | Alta | Seguridad | ✅ Aprobado |
| [TC-SEC-09](#tc-sec-09) | El listado de inscritos es solo para admin | Alta | Seguridad | ✅ Aprobado |
| [TC-SEC-10](#tc-sec-10) | El detalle de una actividad ajena da 403 | Alta | Seguridad | ✅ Aprobado |
| [TC-SEC-11](#tc-sec-11) | El admin conserva emails y pagos en el ranking y en la lista de activos | Media | Seguridad | ✅ Aprobado |
| [TC-SEC-12](#tc-sec-12) | Un error inesperado responde un 500 genérico con el código y sin detalles internos | Alta | Seguridad | ✅ Aprobado |
| [TC-SEC-13](#tc-sec-13) | Swagger apagado en producción salvo que se active | Alta | Seguridad | ✅ Aprobado |

<a id="tc-sec-01"></a>

### TC-SEC-01 · Solo el administrador gestiona retos

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Seguridad y configuración | Alta | Seguridad | 1.3 | ✅ Aprobado |

**Precondiciones**

- Sesión de participante.

**Datos de prueba:** ana@reto.local

**Pasos**

1. POST /api/challenges como participante.
2. POST /api/challenges/:id/activate como participante.

**Resultado esperado**

- 403 en ambos; no se crea ni activa ningún reto.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `app.e2e-spec.ts` | participante no puede crear retos (RBAC 403) |
| ✅ | API e2e | `challenge-lifecycle.e2e-spec.ts` | un participante no puede activar retos (403) |
| ✅ | Sesiones | `parallel-session-test.mjs` | Ana NO puede crear retos (403) |

<a id="tc-sec-02"></a>

### TC-SEC-02 · CORS restringido en producción

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Seguridad y configuración | Alta | Seguridad | 8.4 | ✅ Aprobado |

**Precondiciones**

- Variables CORS_ORIGIN y NODE_ENV.

**Datos de prueba:** CORS_ORIGIN "https://a.com/, https://b.com"; sin CORS_ORIGIN en desarrollo y en producción

**Pasos**

1. Resolver el origen permitido para cada combinación.

**Resultado esperado**

- Lista normalizada (sin espacios ni barra final).
- En desarrollo sin configurar refleja el origen del navegador.
- En producción sin configurar no abre la API a cualquier origen y emite una advertencia.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `cors.spec.ts` | usa la lista configurada y normaliza espacios y slash final |
| ✅ | Unitaria | `cors.spec.ts` | en desarrollo sin configuración refleja el origen del navegador |
| ✅ | Unitaria | `cors.spec.ts` | en producción sin configuración NO abre la API a cualquier origen |
| ✅ | Unitaria | `cors.spec.ts` | avisa cuando falta configuración y calla cuando está bien |

<a id="tc-sec-03"></a>

### TC-SEC-03 · Proxy de confianza y límite global configurable

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Seguridad y configuración | Alta | Seguridad | 8.4 | ✅ Aprobado |

> Relacionado con DEF-02 (ver reporte de validación).

**Precondiciones**

- Variables TRUST_PROXY, THROTTLE_LIMIT y THROTTLE_TTL_MS.

**Datos de prueba:** TRUST_PROXY vacío/"true"/"false"/"2"/"loopback, 10.0.0.0/8"; THROTTLE_LIMIT "500"/"mucho"; THROTTLE_TTL_MS "30000"/"-5"

**Pasos**

1. Resolver trust proxy y el límite global para cada combinación.

**Resultado esperado**

- Producción sin configurar confía en 1 proxy; desarrollo en ninguno.
- Los valores explícitos se respetan.
- Por defecto 100 peticiones por 60 s; valores inválidos vuelven al defecto.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `http.spec.ts` | en producción sin configurar confía en un proxy delante |
| ✅ | Unitaria | `http.spec.ts` | en desarrollo sin configurar no confía en proxies |
| ✅ | Unitaria | `http.spec.ts` | respeta la configuración explícita |
| ✅ | Unitaria | `http.spec.ts` | usa 100 peticiones por minuto por defecto |
| ✅ | Unitaria | `http.spec.ts` | admite límites configurados y descarta valores inválidos |

<a id="tc-sec-04"></a>

### TC-SEC-04 · El seed exige contraseña de admin en producción

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Seguridad y configuración | Alta | Seguridad | 8.4 | ✅ Aprobado (manual) |

**Precondiciones**

- Base de datos accesible.

**Datos de prueba:** NODE_ENV=production y SEED_ADMIN_PASSWORD vacío

**Pasos**

1. cd backend && NODE_ENV=production SEED_ADMIN_PASSWORD= npx ts-node prisma/seed.ts
2. Consultar si cambió algún usuario.

**Resultado esperado**

- Sale con código 1 y el mensaje "SEED_ADMIN_PASSWORD es obligatorio en producción".
- No modifica la base (0 usuarios actualizados).

**Verificación manual:** Aprobado el 2026-10-01. Evidencia: exit=1, mensaje mostrado y 0 usuarios modificados en los 2 minutos siguientes.

<a id="tc-sec-05"></a>

### TC-SEC-05 · La vigencia de los tokens se valida al arrancar

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Seguridad y configuración | Alta | Seguridad | 8.4 | ✅ Aprobado |

**Precondiciones**

- Variables JWT_ACCESS_EXPIRES_IN y JWT_REFRESH_EXPIRES_IN.

**Datos de prueba:** Vacías; "30m", "12h", "2 days", "900"; "quince minutos" y "15 lunas"

**Pasos**

1. Resolver la vigencia de cada token con cada valor.

**Resultado esperado**

- Sin valor se usan 15m y 7d.
- Las duraciones válidas se aceptan; un número son segundos.
- Un valor mal escrito hace fallar el arranque con un mensaje que nombra la variable, en vez de emitir tokens con una vigencia inesperada.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `jwt-expiry.spec.ts` | usa el valor por defecto si la variable no está definida |
| ✅ | Unitaria | `jwt-expiry.spec.ts` | acepta duraciones con unidad y segundos como número |
| ✅ | Unitaria | `jwt-expiry.spec.ts` | rechaza un valor mal escrito nombrando la variable |

<a id="tc-sec-06"></a>

### TC-SEC-06 · El ranking no expone emails ni estado de pago a participantes

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Seguridad y configuración | Alta | Seguridad | 6.1 | ✅ Aprobado |

**Precondiciones**

- Reto activo con Ana (pagada) y Bruno (sin pagar) inscritos.
- Sesión de participante.

**Datos de prueba:** ana@reto.local, bruno@reto.local

**Pasos**

1. GET /api/challenges/:id/results como Ana.
2. Abrir Ranking como Ana con el reto seleccionado.

**Resultado esperado**

- Ninguna fila de ranking, empatados, ganadores ni premiados trae email ni campos de pago; Bruno aparece por su nombre.
- El pote (payout) sigue completo.
- La tabla muestra nombres sin emails y la fila propia dice "(tú)".

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `privacy.spec.ts` | participante: filas con lista blanca y sin email ni pago |
| ✅ | Unitaria | `privacy.spec.ts` | participante: nivel superior, valores y orden idénticos al del admin |
| ✅ | Unitaria | `privacy.spec.ts` | una columna nueva del ranking no se filtra |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | SEC: el ranking no expone email ni pago a un participante; el admin sí los ve |
| ✅ | UI | `11-privacy.spec.ts` | el ranking no expone emails ni estado de pago a un participante |
| ✅ | UI | `11-privacy.spec.ts` | el ranking muestra nombres sin emails y marca la fila propia |
| ✅ | Sesiones | `parallel-session-test.mjs` | El ranking que ve Ana no trae emails ni estado de pago |

<a id="tc-sec-07"></a>

### TC-SEC-07 · La lista de retos activos no trae inscritos al participante y el pago propio va en me

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Seguridad y configuración | Alta | Seguridad | 6.1 | ✅ Aprobado |

**Precondiciones**

- Reto activo con Ana pagada.
- Sesión de participante.

**Datos de prueba:** ana@reto.local

**Pasos**

1. GET /api/challenges/active/list y GET /api/challenges/active como Ana.
2. Abrir el inicio como Ana con el reto seleccionado.

**Resultado esperado**

- Ningún reto trae la lista de inscritos; cada uno trae isParticipant.
- me trae solo paid, paidAt, amountPaid, paymentProofUrl, paymentProofUploadedAt, joinedAt y paymentStatus (siete claves), con los valores de Ana.
- El inicio muestra "Estado: pagado" en el comprobante de pago.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `privacy.spec.ts` | devuelve los seis campos propios más paymentStatus, sin el id de Cloudinary |
| ✅ | Unitaria | `privacy.spec.ts` | participante: el estado de pago de otra persona no aparece en ninguna parte |
| ✅ | Unitaria | `privacy.spec.ts` | participante inscrito: sin participants, con su me e isParticipant |
| ✅ | Unitaria | `privacy.spec.ts` | una columna nueva del inscrito no se filtra en me |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | SEC: un participante no recibe la lista de inscritos y su pago va en me |
| ✅ | UI | `11-privacy.spec.ts` | la lista de retos activos no trae inscritos y el pago propio va en me |
| ✅ | UI | `11-privacy.spec.ts` | el dashboard muestra el estado de pago propio |
| ✅ | Sesiones | `parallel-session-test.mjs` | El participante no recibe la lista de inscritos (solo su propio pago en me) |

<a id="tc-sec-08"></a>

### TC-SEC-08 · El detalle del reto se proyecta por rol y el admin inscrito conserva su me

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Seguridad y configuración | Alta | Seguridad | 6.1 | ✅ Aprobado |

**Precondiciones**

- Reto activo con inscritos.

**Datos de prueba:** ana@reto.local; un participante no inscrito; admin

**Pasos**

1. GET /api/challenges/:id como Ana, como un no inscrito y como admin.

**Resultado esperado**

- Ana recibe me y no la lista de inscritos.
- El no inscrito recibe me = null.
- El admin recibe la lista completa con emails y pagos, más su propio me (null si no está inscrito).

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `privacy.spec.ts` | admin: participants intactos más me |
| ✅ | Unitaria | `privacy.spec.ts` | admin inscrito: también recibe su propio me |
| ✅ | Unitaria | `privacy.spec.ts` | participante no inscrito: me null y sin participants |
| ✅ | Unitaria | `privacy.spec.ts` | null si no está inscrito |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | SEC: un participante no inscrito recibe me null |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | SEC: el admin conserva la lista de inscritos con email y pago, más me |
| ✅ | UI | `11-privacy.spec.ts` | el detalle del reto se proyecta por rol |

<a id="tc-sec-09"></a>

### TC-SEC-09 · El listado de inscritos es solo para admin

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Seguridad y configuración | Alta | Seguridad | 1.3 | ✅ Aprobado |

**Precondiciones**

- Reto con inscritos.

**Datos de prueba:** ana@reto.local; admin

**Pasos**

1. GET /api/challenges/:id/participants como Ana y como admin.

**Resultado esperado**

- Ana recibe 403.
- El admin recibe la lista con email, rol y estado.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | SEC: el listado de inscritos es solo para admin (403 al participante) |
| ✅ | UI | `11-privacy.spec.ts` | el listado de inscritos es solo para admin |
| ✅ | Sesiones | `parallel-session-test.mjs` | El listado de inscritos es solo para admin (403 a Ana) |

<a id="tc-sec-10"></a>

### TC-SEC-10 · El detalle de una actividad ajena da 403

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Seguridad y configuración | Alta | Seguridad | 6.1 | ✅ Aprobado |

**Precondiciones**

- Una actividad de Bruno y una de Ana en el mismo reto.

**Datos de prueba:** ana@reto.local, bruno@reto.local; admin

**Pasos**

1. GET /api/activities/:id de Bruno como Ana.
2. La propia como Ana; la de Bruno como admin; un id inexistente.

**Resultado esperado**

- Ana recibe 403 "No puedes ver esta actividad" sin datos de la actividad.
- La propia y la del admin responden 200 con la forma de siempre.
- Un id inexistente da 404.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `activities.service.spec.ts` | el dueño recibe su actividad con heartRateCompliant |
| ✅ | Unitaria | `activities.service.spec.ts` | otro participante recibe 403 con el mensaje exacto |
| ✅ | Unitaria | `activities.service.spec.ts` | un admin recibe cualquier actividad |
| ✅ | Unitaria | `activities.service.spec.ts` | una actividad inexistente da 404 a cualquier rol |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | SEC: el detalle de una actividad es solo para su dueño o un admin |
| ✅ | UI | `11-privacy.spec.ts` | el detalle de una actividad ajena da 403 |

<a id="tc-sec-11"></a>

### TC-SEC-11 · El admin conserva emails y pagos en el ranking y en la lista de activos

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Seguridad y configuración | Media | Seguridad | 6.1 | ✅ Aprobado |

**Precondiciones**

- Reto activo con Bruno sin pagar.
- Sesión de administrador.

**Datos de prueba:** admin; bruno@reto.local

**Pasos**

1. GET /api/challenges/:id/results y GET /api/challenges/active/list como admin.
2. Abrir Ranking como admin con el reto seleccionado.

**Resultado esperado**

- Las filas del ranking traen email y paid; la lista de activos trae los inscritos con su email.
- La tabla muestra el email de cada participante.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `privacy.spec.ts` | admin: la misma respuesta, sin copiar |
| ✅ | UI | `11-privacy.spec.ts` | el admin conserva emails y pagos en el ranking y en la lista de activos |
| ✅ | UI | `11-privacy.spec.ts` | el ranking muestra el email de cada participante |

<a id="tc-sec-12"></a>

### TC-SEC-12 · Un error inesperado responde un 500 genérico con el código y sin detalles internos

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Seguridad y configuración | Alta | Seguridad | 8.1 | ✅ Aprobado |

**Precondiciones**

- API en marcha.

**Datos de prueba:** Un servicio que lanza Error("detalle interno")

**Pasos**

1. Provocar el error en GET /api/challenges.
2. Revisar respuesta y logs.

**Resultado esperado**

- 500 con { statusCode, message, requestId }; el mensaje en español incluye el requestId de la cabecera.
- La respuesta no contiene "detalle interno".
- Una sola línea ERROR con el stack y el mismo requestId; los 4xx de negocio, el 413 y el 429 no cambian ni dejan líneas ERROR.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `all-exceptions.filter.spec.ts` | un error inesperado responde el 500 genérico sin el mensaje interno y con stack |
| ✅ | Unitaria | `all-exceptions.filter.spec.ts` | un 409 sale intacto y sin línea ERROR |
| ✅ | Unitaria | `all-exceptions.filter.spec.ts` | un 429 del limitador conserva su cuerpo |
| ✅ | Unitaria | `all-exceptions.filter.spec.ts` | el JSON mal formado (BadRequestException) responde 400 sin línea ERROR |
| ✅ | Unitaria | `all-exceptions.filter.spec.ts` | un 413 de http-errors se responde directo y sin línea ERROR |
| ✅ | Unitaria | `all-exceptions.filter.spec.ts` | con las cabeceras ya enviadas termina la respuesta sin escribir |
| ✅ | Unitaria | `all-exceptions.filter.spec.ts` | sin middleware toma el identificador de la cabecera y lo devuelve |
| ✅ | Unitaria | `all-exceptions.filter.spec.ts` | sin middleware fija la cabecera también en los 4xx |
| ✅ | Unitaria | `all-exceptions.filter.spec.ts` | solo acepta códigos enteros 4xx con mensaje |
| ✅ | Unitaria | `all-exceptions.filter.spec.ts` | statusCode en texto va al 500 genérico |
| ✅ | Unitaria | `all-exceptions.filter.spec.ts` | mensaje vacío va al 500 genérico |
| ✅ | Unitaria | `all-exceptions.filter.spec.ts` | http-errors 5xx va al 500 genérico |
| ✅ | Unitaria | `all-exceptions.filter.spec.ts` | un valor que no es objeto va al 500 genérico |
| ✅ | API e2e | `ops-observability.e2e-spec.ts` | OPS: un error inesperado responde el 500 genérico con el identificador y sin el detalle interno |
| ✅ | API e2e | `ops-throttle.e2e-spec.ts` | OPS: el sexto login fallido en un minuto responde 429 con el cuerpo del limitador y X-Request-Id |

<a id="tc-sec-13"></a>

### TC-SEC-13 · Swagger apagado en producción salvo que se active

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Seguridad y configuración | Alta | Seguridad | 8.4 | ✅ Aprobado |

**Precondiciones**

- API compilada.

**Datos de prueba:** NODE_ENV=production con y sin SWAGGER_ENABLED=true

**Pasos**

1. Arrancar en producción y abrir /api/docs.
2. Repetir con SWAGGER_ENABLED=true.

**Resultado esperado**

- Sin la variable, /api/docs responde 404 (con X-Request-Id).
- Con SWAGGER_ENABLED=true, Swagger se sirve; en desarrollo y pruebas está encendido por defecto.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `http.spec.ts` | sin configurar: apagado en producción, encendido en desarrollo y pruebas |
| ✅ | Unitaria | `http.spec.ts` | SWAGGER_ENABLED manda en cualquier entorno |

<a id="chal"></a>

## Gestión de retos

| ID | Caso | Prioridad | Tipo | Estado |
|---|---|---|---|---|
| [TC-CHAL-01](#tc-chal-01) | Crear un reto | Alta | Funcional | ✅ Aprobado |
| [TC-CHAL-02](#tc-chal-02) | Un reto por mes y año | Media | Negativo | ✅ Aprobado |
| [TC-CHAL-03](#tc-chal-03) | Período con fechas válidas | Media | Negativo | ✅ Aprobado |
| [TC-CHAL-04](#tc-chal-04) | Activar un reto | Alta | Funcional | ✅ Aprobado |
| [TC-CHAL-05](#tc-chal-05) | Editar las reglas de un reto | Media | Funcional | ✅ Aprobado |
| [TC-CHAL-06](#tc-chal-06) | Reto activo por defecto | Alta | Funcional | ✅ Aprobado |
| [TC-CHAL-07](#tc-chal-07) | Varios retos con reglas distintas | Media | Funcional | ✅ Aprobado |
| [TC-CHAL-08](#tc-chal-08) | Varios retos activos a la vez | Alta | Funcional | ✅ Aprobado |
| [TC-CHAL-09](#tc-chal-09) | Actividades independientes por reto | Alta | Funcional | ✅ Aprobado |
| [TC-CHAL-10](#tc-chal-10) | Selector de reto en la web | Media | UI | ✅ Aprobado |
| [TC-CHAL-11](#tc-chal-11) | Cerrar un reto y no reactivarlo | Alta | Funcional | ✅ Aprobado |
| [TC-CHAL-12](#tc-chal-12) | Consultar en la web el ranking de un reto cerrado | Media | Funcional | ✅ Aprobado |
| [TC-CHAL-13](#tc-chal-13) | Un reto cerrado es definitivo | Alta | Seguridad | ✅ Aprobado |
| [TC-CHAL-14](#tc-chal-14) | Las actividades de un reto cerrado son definitivas | Alta | Seguridad | ✅ Aprobado |
| [TC-CHAL-15](#tc-chal-15) | Las escrituras esperan al cierre y nunca caen después | Alta | Seguridad | ✅ Aprobado |
| [TC-CHAL-16](#tc-chal-16) | Solo se cierra un reto activo, siempre por el mismo paso | Alta | Negativo | ✅ Aprobado |
| [TC-CHAL-17](#tc-chal-17) | El sorteo es justo y se guarda al cerrar | Alta | Funcional | ✅ Aprobado |
| [TC-CHAL-18](#tc-chal-18) | La premiación del admin reemplaza al sorteo automático; la nota está reservada | Media | Funcional | ✅ Aprobado |
| [TC-CHAL-19](#tc-chal-19) | Resumen previo al cierre (solo lectura, solo admin) | Alta | Funcional | ✅ Aprobado |
| [TC-CHAL-20](#tc-chal-20) | Cerrar o premiar desde la web pasa por la revisión previa | Alta | UI | ✅ Aprobado |
| [TC-CHAL-21](#tc-chal-21) | Acta del reto cerrado en CSV (solo admin, solo lectura) | Alta | Funcional | ✅ Aprobado |
| [TC-CHAL-22](#tc-chal-22) | Descargar el acta desde el ranking de un reto cerrado | Media | UI | ✅ Aprobado |

<a id="tc-chal-01"></a>

### TC-CHAL-01 · Crear un reto

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Gestión de retos | Alta | Funcional | 2.1 | ✅ Aprobado |

**Precondiciones**

- Sesión de administrador.

**Datos de prueba:** name, month, year, startDate < endDate, validDays [1..6], feePerParticipant, currency, prizeBudget, minHeartRateMinutes

**Pasos**

1. Abrir Retos > Nuevo reto (o POST /api/challenges).
2. Completar el formulario y guardar.

**Resultado esperado**

- 201 con el reto en estado DRAFT.
- Las reglas enviadas quedan persistidas; las de puntaje toman sus defaults si no se envían.
- El formulario web muestra el bloque "Reglas de puntaje".

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `challenge-lifecycle.e2e-spec.ts` | admin crea dos retos en DRAFT con fechas que se solapan |
| ✅ | API e2e | `challenge-scoring.e2e-spec.ts` | crea un reto con reglas propias y las persiste |
| ✅ | UI | `05-challenges-scoring.spec.ts` | el formulario de reto trae las reglas de puntaje con sus valores por defecto |
| ✅ | Guía | `capture.spec.ts` | menú de administración y lista de retos |

<a id="tc-chal-02"></a>

### TC-CHAL-02 · Un reto por mes y año

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Gestión de retos | Media | Negativo | 2.1 | ✅ Aprobado |

**Precondiciones**

- Existe un reto para el mes/año.

**Datos de prueba:** Mismo month y year que un reto existente

**Pasos**

1. POST /api/challenges con el mes repetido.

**Resultado esperado**

- 409 "Ya existe un reto para M/AAAA".

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | CHAL: no permite dos retos para el mismo mes y año (409) |

<a id="tc-chal-03"></a>

### TC-CHAL-03 · Período con fechas válidas

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Gestión de retos | Media | Negativo | 2.1 | ✅ Aprobado |

**Precondiciones**

- Sesión de administrador.

**Datos de prueba:** startDate igual o posterior a endDate

**Pasos**

1. POST /api/challenges con el período invertido.

**Resultado esperado**

- 400 "startDate debe ser menor que endDate".

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | CHAL: rechaza un período con inicio igual o posterior al fin (400) |

<a id="tc-chal-04"></a>

### TC-CHAL-04 · Activar un reto

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Gestión de retos | Alta | Funcional | 2.2 | ✅ Aprobado |

**Precondiciones**

- Reto en DRAFT.

**Datos de prueba:** POST /api/challenges/:id/activate; PATCH { status: "ACTIVE" }

**Pasos**

1. Activar el reto.
2. Activarlo otra vez.
3. Activar un id inexistente.

**Resultado esperado**

- DRAFT pasa a ACTIVE.
- Reactivar un ACTIVE es idempotente (no escribe).
- Id inexistente: 404.
- Activar por PATCH aplica las mismas reglas y el resto de campos.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `challenges.service.spec.ts` | activa un reto en DRAFT |
| ✅ | Unitaria | `challenges.service.spec.ts` | es idempotente si el reto ya está ACTIVE (no escribe) |
| ✅ | Unitaria | `challenges.service.spec.ts` | devuelve 404 si el reto no existe |
| ✅ | Unitaria | `challenges.service.spec.ts` | activa y además aplica el resto de campos |
| ✅ | Unitaria | `challenges.service.spec.ts` | sin más campos devuelve el reto activado sin segunda escritura |
| ✅ | API e2e | `challenge-lifecycle.e2e-spec.ts` | activar A: DRAFT -> ACTIVE |
| ✅ | API e2e | `challenge-lifecycle.e2e-spec.ts` | reactivar A es idempotente |

<a id="tc-chal-05"></a>

### TC-CHAL-05 · Editar las reglas de un reto

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Gestión de retos | Media | Funcional | 2.3 | ✅ Aprobado |

**Precondiciones**

- Reto en borrador o activo, con cuota 120.
- Un reto cerrado en la lista.

**Datos de prueba:** Web: Retos > Editar, cuota 150; luego Fin = 2024-12-15 (antes del inicio). API: PATCH con validDays, cuota y premio nuevos; PATCH solo con endDate anterior al inicio

**Pasos**

1. Abrir Retos y pulsar Editar en el reto activo.
2. Cambiar la cuota a 150 y pulsar Guardar cambios.
3. Volver a editar, poner un fin anterior al inicio y guardar.
4. Revisar el reto cerrado de la lista.

**Resultado esperado**

- El formulario viene con los valores actuales, el mes y el año fijos, y avisa que el reto está activo.
- La cuota queda en 150 y el reto sigue activo; solo se envía lo que cambió.
- Un período con el fin antes del inicio muestra "startDate debe ser menor que endDate" y nada cambia (la API valida el período combinando lo nuevo con lo guardado).
- El reto cerrado no ofrece Editar.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `challenges.service.spec.ts` | valida el período combinando los valores nuevos con los guardados |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | CHAL: PATCH cambia las reglas de un reto existente |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | CHAL: editar solo la fecha de fin antes del inicio se rechaza (400) y no cambia el reto |
| ✅ | UI | `10-api-only-actions.spec.ts` | edita un reto activo desde la web y un reto cerrado no ofrece edición |
| ✅ | UI | `10-api-only-actions.spec.ts` | un período con el fin antes del inicio muestra el error de la API y no cambia nada |
| ✅ | Guía | `capture.spec.ts` | editar un reto activo |

<a id="tc-chal-06"></a>

### TC-CHAL-06 · Reto activo por defecto

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Gestión de retos | Alta | Funcional | 2.4 | ✅ Aprobado |

**Precondiciones**

- Dos retos ACTIVE: A (más antiguo) con el usuario inscrito y B (más reciente) sin él.

**Datos de prueba:** GET /api/challenges/active como inscrito y como no inscrito

**Pasos**

1. Consultar el reto activo con cada usuario.
2. Consultar sin retos activos.

**Resultado esperado**

- El inscrito recibe A; el no inscrito recibe B.
- Sin retos activos: null.
- La respuesta incluye me con el pago propio; la lista de inscritos solo llega al admin.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `challenges.service.spec.ts` | prefiere el reto activo más reciente en el que participa el usuario |
| ✅ | Unitaria | `challenges.service.spec.ts` | si no participa en ninguno devuelve el activo más reciente |
| ✅ | Unitaria | `challenges.service.spec.ts` | devuelve null sin retos activos |
| ✅ | API e2e | `challenge-lifecycle.e2e-spec.ts` | GET /challenges/active: prefiere el reto donde participa el usuario |
| ✅ | API e2e | `challenge-lifecycle.e2e-spec.ts` | GET /challenges/active: sin participación devuelve el activo más reciente |
| ✅ | Sesiones | `parallel-session-test.mjs` | Hay un reto activo |
| ✅ | Sesiones | `parallel-session-test.mjs` | GET /challenges/active devuelve un reto donde Ana participa |

<a id="tc-chal-07"></a>

### TC-CHAL-07 · Varios retos con reglas distintas

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Gestión de retos | Media | Funcional | 2.1 | ✅ Aprobado |

**Precondiciones**

- Sesión de administrador.

**Datos de prueba:** Segundo reto con validDays [0,6], minHeartRateMinutes 30, currency USD

**Pasos**

1. Crear el segundo reto (idempotente si ya existe).
2. GET /api/challenges.

**Resultado esperado**

- El listado incluye ambos retos.
- Cada uno conserva sus propias reglas.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Sesiones | `parallel-session-test.mjs` | Segundo reto (2) |
| ✅ | Sesiones | `parallel-session-test.mjs` | Listado de retos disponible |

<a id="tc-chal-08"></a>

### TC-CHAL-08 · Varios retos activos a la vez

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Gestión de retos | Alta | Funcional | 2.4 | ✅ Aprobado |

**Precondiciones**

- A en ACTIVE; B en DRAFT.

**Datos de prueba:** GET /api/challenges/active/list

**Pasos**

1. Activar B con A activo.
2. Listar los activos como usuario inscrito solo en A.

**Resultado esperado**

- Ambos quedan ACTIVE (activar no cierra a los demás).
- La lista es [B, A] con isParticipant [false, true].
- Sin activos la lista es vacía.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `challenges.service.spec.ts` | no bloquea la activación aunque exista otro reto ACTIVE |
| ✅ | Unitaria | `challenges.service.spec.ts` | lista los activos del más reciente al más antiguo con isParticipant |
| ✅ | Unitaria | `challenges.service.spec.ts` | devuelve lista vacía sin retos activos |
| ✅ | API e2e | `challenge-lifecycle.e2e-spec.ts` | activar B mientras A está activo: ambos quedan ACTIVE |
| ✅ | API e2e | `challenge-lifecycle.e2e-spec.ts` | GET /challenges/active/list: más reciente primero e isParticipant por usuario |

<a id="tc-chal-09"></a>

### TC-CHAL-09 · Actividades independientes por reto

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Gestión de retos | Alta | Funcional | 2.4 | ✅ Aprobado |

**Precondiciones**

- Usuario inscrito en A y B con fechas solapadas.

**Datos de prueba:** Misma fecha en A y en B; repetida en A

**Pasos**

1. Registrar la fecha en A y en B.
2. Repetirla en A.
3. Consultar ambos rankings.

**Resultado esperado**

- 201 y 201.
- El duplicado en A: 409.
- Cada ranking cuenta solo sus actividades.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `challenge-lifecycle.e2e-spec.ts` | actividades por reto: misma fecha en A y B (201 x2), duplicado en A -> 409, rankings independientes |

<a id="tc-chal-10"></a>

### TC-CHAL-10 · Selector de reto en la web

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Gestión de retos | Media | UI | 2.4 | ✅ Aprobado |

**Precondiciones**

- Dos o más retos activos.

**Datos de prueba:** Selector "Reto activo seleccionado" en la cabecera

**Pasos**

1. Abrir el dashboard.
2. Cambiar de reto en el selector.
3. Recargar la página.

**Resultado esperado**

- Con un solo reto no hay selector; con varios aparece.
- Mi reto, Subir actividad y Ranking usan el reto elegido.
- La elección sobrevive la recarga.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | UI | `05-challenges-scoring.spec.ts` | con varios retos activos aparece el selector y la elección persiste |
| ✅ | Guía | `capture.spec.ts` | selector de reto con varios retos activos |

<a id="tc-chal-11"></a>

### TC-CHAL-11 · Cerrar un reto y no reactivarlo

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Gestión de retos | Alta | Funcional | 6.3 | ✅ Aprobado |

**Precondiciones**

- A y B activos.

**Datos de prueba:** POST /api/challenges/:id/close; luego activate y PATCH { status: "ACTIVE" }

**Pasos**

1. Cerrar A.
2. Listar activos.
3. Intentar reactivar A por activate y por PATCH.

**Resultado esperado**

- A pasa a COMPLETED, B sigue ACTIVE y A sale de la lista de activos.
- Reactivar un COMPLETED: 400 por ambas vías.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `challenges.service.spec.ts` | rechaza reactivar un reto COMPLETED con 400 |
| ✅ | Unitaria | `challenges.service.spec.ts` | aplica las reglas de activación (COMPLETED -> 400) |
| ✅ | API e2e | `challenge-lifecycle.e2e-spec.ts` | cerrar A mantiene B activo y A ya no aparece en la lista |
| ✅ | API e2e | `challenge-lifecycle.e2e-spec.ts` | un reto COMPLETED no puede reactivarse (400), ni por PATCH |

<a id="tc-chal-12"></a>

### TC-CHAL-12 · Consultar en la web el ranking de un reto cerrado

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Gestión de retos | Media | Funcional | 6.5 | ✅ Aprobado |

> Relacionado con OBS-01 (ver reporte de validación).

**Precondiciones**

- Un reto en COMPLETED con una actividad validada de Ana y la premiación registrada (presupuesto 300 BOB).
- Un reto activo elegido en el encabezado.

**Datos de prueba:** Reto "E2E Playwright · reto cerrado" (noviembre de 2025); dirección /dashboard/results?reto=<id>; un id inexistente

**Pasos**

1. Abrir Ranking y elegir el reto en "Retos cerrados".
2. Pulsar "Volver al reto activo".
3. Abrir directamente la dirección del reto cerrado, y luego una con un id inexistente.
4. Con la lista de retos activos vacía, abrir Ranking.
5. Como administrador, abrir el reto cerrado.

**Resultado esperado**

- Se ve el ranking final, el bloque de ganadores con Ana y "300 BOB por ganador" sin la marca "proyectado"; el título dice "cerrado el …" y la dirección incluye ?reto=<id>.
- Al volver se ve otra vez el reto activo, y el reto elegido en el encabezado no cambió.
- La dirección compartida abre el reto cerrado; un id inexistente muestra el ranking activo sin error.
- Sin retos activos, la página ofrece los retos cerrados como enlaces.
- El administrador ve el reto cerrado en solo lectura: sin panel de premiación (que sigue en el reto activo).

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | UI | `08-closed-results.spec.ts` | un reto cerrado muestra su ranking final, los ganadores y el premio final |
| ✅ | UI | `08-closed-results.spec.ts` | abrir un reto cerrado no cambia el reto activo del encabezado |
| ✅ | UI | `08-closed-results.spec.ts` | la dirección de un reto cerrado se puede compartir |
| ✅ | UI | `08-closed-results.spec.ts` | una dirección con un reto desconocido muestra el ranking activo |
| ✅ | UI | `08-closed-results.spec.ts` | sin reto activo, el ranking ofrece los retos cerrados |
| ✅ | UI | `08-closed-results.spec.ts` | un reto cerrado se consulta en solo lectura, sin panel de premiación |
| ✅ | Guía | `capture.spec.ts` | ranking de un reto cerrado |

<a id="tc-chal-13"></a>

### TC-CHAL-13 · Un reto cerrado es definitivo

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Gestión de retos | Alta | Seguridad | 6.3 | ✅ Aprobado |

> Relacionado con OBS-03 (ver reporte de validación).

**Precondiciones**

- Un reto en COMPLETED con su premiación registrada.

**Datos de prueba:** PATCH con pointsPerKm 5 y maxWinners 3; PATCH con status DRAFT; POST close de nuevo; POST awards después del cierre

**Pasos**

1. Intentar cambiar las reglas del reto cerrado.
2. Intentar devolverlo a borrador.
3. Volver a cerrarlo.
4. Registrar su premiación después del cierre.

**Resultado esperado**

- Cambiar reglas o estado: 400 "No se puede modificar un reto cerrado"; las reglas y los ganadores no cambian.
- Volver a cerrarlo no cambia nada y no es un error (idempotente).
- La premiación se puede registrar después del cierre (sorteo presencial) y el reto sigue cerrado.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `challenges.service.spec.ts` | un reto cerrado no admite cambios de reglas |
| ✅ | Unitaria | `challenges.service.spec.ts` | un reto cerrado no vuelve a borrador |
| ✅ | Unitaria | `challenges.service.spec.ts` | cerrar un reto ya cerrado es idempotente (no escribe ni falla) |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | CHAL: un reto cerrado no admite cambios de reglas (400) y conserva su resultado |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | CHAL: un reto cerrado no vuelve a borrador (400) y cerrarlo de nuevo no cambia nada |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | RES: la premiación de un reto cerrado se puede registrar después del cierre |
| ✅ | Sesiones | `parallel-session-test.mjs` | Un reto cerrado no vuelve a borrador |

<a id="tc-chal-14"></a>

### TC-CHAL-14 · Las actividades de un reto cerrado son definitivas

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Gestión de retos | Alta | Seguridad | 6.3 | ✅ Aprobado |

**Precondiciones**

- Un reto en COMPLETED con una actividad pendiente y otra validada.

**Datos de prueba:** Validar, rechazar y borrar como admin; borrar como dueño y como extraño

**Pasos**

1. Validar la pendiente y volver a validar la validada.
2. Rechazar la validada.
3. Borrar la pendiente como admin, como su dueño y como otro participante.

**Resultado esperado**

- Todo responde 400 "El reto está cerrado; sus actividades son definitivas", también al admin, antes que los chequeos de dueño o de estado.
- Las actividades y el ranking del reto no cambian.
- En un reto activo, validar, rechazar y borrar siguen como antes (regla de FC y permisos).

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `activities.service.spec.ts` | validar, rechazar o borrar en un reto cerrado responde 400, también al admin |
| ✅ | Unitaria | `activities.service.spec.ts` | el reto cerrado va antes que los chequeos de dueño y de estado |
| ✅ | Unitaria | `activities.service.spec.ts` | en un reto activo, borrar sigue las reglas de siempre |
| ✅ | Unitaria | `activities.service.spec.ts` | decide con la actividad releída bajo el lock |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | FREEZE: en un reto cerrado nadie valida, rechaza ni borra actividades (400) |
| ✅ | Sesiones | `parallel-session-test.mjs` | La actividad de un reto cerrado no se puede retirar (400) |

<a id="tc-chal-15"></a>

### TC-CHAL-15 · Las escrituras esperan al cierre y nunca caen después

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Gestión de retos | Alta | Seguridad | 6.3 | ✅ Aprobado |

**Precondiciones**

- Un reto activo y un cierre en curso (el reto bloqueado por otra transacción).

**Datos de prueba:** Validar mientras otra transacción retiene el bloqueo más de 5 s; escrituras que leyeron ACTIVE cuando el reto ya se cerró

**Pasos**

1. Validar una actividad mientras el reto está bloqueado más de 5 s.
2. Crear una actividad, inscribir, quitar, registrar un pago, subir un comprobante, cambiar reglas o activar cuando el reto se cerró después del primer chequeo.

**Resultado esperado**

- La validación responde 409 "El reto se está cerrando; vuelve a intentarlo en unos segundos" y la actividad no cambia (nunca 500).
- Las escrituras se rechazan sin cambios: "El reto no está activo" al crear, "No se puede modificar un reto cerrado" en participantes, pagos y reglas, "Un reto cerrado no puede reactivarse" al activar.
- Pedir el cierre de nuevo sigue siendo idempotente.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `challenge-lock.spec.ts` | reconoce el timeout de la transacción y el lock_timeout de Postgres |
| ✅ | Unitaria | `challenge-lock.spec.ts` | no confunde otros errores con un timeout de lock |
| ✅ | Unitaria | `challenge-lock.spec.ts` | traduce un timeout de lock a 409 con mensaje legible |
| ✅ | Unitaria | `challenge-lock.spec.ts` | deja pasar los demás errores y el resultado |
| ✅ | Unitaria | `challenge-lock.spec.ts` | usa los tiempos de espera de las escrituras por defecto |
| ✅ | Unitaria | `challenge-lock.spec.ts` | fija el lock_timeout y bloquea la fila en modo compartido o exclusivo |
| ✅ | Unitaria | `challenge-lock.spec.ts` | un reto inexistente da 404 |
| ✅ | Unitaria | `activities.service.spec.ts` | crear una actividad cuando el reto se cerró bajo el lock responde "El reto no está activo" |
| ✅ | Unitaria | `challenges.service.spec.ts` | inscribir, quitar y registrar pagos se rechazan si el reto se cerró bajo el lock |
| ✅ | Unitaria | `challenges.service.spec.ts` | un cambio de reglas que leyó ACTIVE no cae después del cierre |
| ✅ | Unitaria | `challenges.service.spec.ts` | pedir el cierre cuando otro cierre ganó la carrera sigue siendo idempotente |
| ✅ | Unitaria | `challenges.service.spec.ts` | activar un reto que se cerró bajo el lock responde 400 |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | FREEZE: si el reto está bloqueado por un cierre más de 5 s, validar responde 409 y no cambia nada |

<a id="tc-chal-16"></a>

### TC-CHAL-16 · Solo se cierra un reto activo, siempre por el mismo paso

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Gestión de retos | Alta | Negativo | 6.3 | ✅ Aprobado |

**Precondiciones**

- Un reto en borrador con un inscrito y un reto activo.

**Datos de prueba:** POST close, PATCH status COMPLETED y POST awards sobre el borrador; PATCH { status: COMPLETED, pointsPerKm: 5 } sobre el activo

**Pasos**

1. Cerrar el borrador por las tres vías.
2. Enviar un PATCH de cierre mezclado al activo.

**Resultado esperado**

- Las tres vías responden 400 "Solo se puede cerrar un reto activo"; el borrador sigue en borrador y sin awards.
- El PATCH mezclado responde 400 "Para cerrar el reto envía solo el estado"; el reto sigue activo y sus reglas no cambian.
- Solo el estado delega en el mismo paso de cierre que POST close.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `challenges.service.spec.ts` | un borrador no se cierra ni se premia (400) |
| ✅ | Unitaria | `challenges.service.spec.ts` | un PATCH de cierre con otros campos se rechaza y solo el estado delega en el cierre |
| ✅ | Unitaria | `challenges.service.spec.ts` | cerrar un reto cerrado no cambia nada ni vuelve a sortear |
| ✅ | API e2e | `close-draw.e2e-spec.ts` | CLOSE: un borrador no se cierra por ninguna vía (400) y sigue en borrador |
| ✅ | API e2e | `close-draw.e2e-spec.ts` | CLOSE: un PATCH de cierre con otros campos se rechaza (400) y no cambia nada |

<a id="tc-chal-17"></a>

### TC-CHAL-17 · El sorteo es justo y se guarda al cerrar

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Gestión de retos | Alta | Funcional | 6.2 | ✅ Aprobado |

**Precondiciones**

- Un reto activo con 4 participantes empatados en el tope.

**Datos de prueba:** maxWinners 2 con DRAW; TOTAL_KM con 30, 20, 20 y 10 km

**Pasos**

1. Cerrar el reto con DRAW y leer los resultados varias veces.
2. Cerrarlo de nuevo.
3. Cerrar el de TOTAL_KM.

**Resultado esperado**

- Al cerrar se sortea una vez con una permutación uniforme y se guardan los 2 ganadores como awards con la nota "Sorteo automático al cierre".
- Todas las lecturas devuelven los mismos ganadores, sin sorteo pendiente y con la nota "Ganadores definidos por sorteo automático al cierre.".
- Cerrar de nuevo no vuelve a sortear.
- Con TOTAL_KM se guardan el de 30 km y el sorteado entre los de 20 km.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `scoring.spec.ts` | Fisher-Yates con una fuente fija da la permutación esperada |
| ✅ | Unitaria | `scoring.spec.ts` | las 6 permutaciones de 3 salen con frecuencia uniforme (1/6 ± 0,01) |
| ✅ | Unitaria | `scoring.spec.ts` | con el randomInt real aparecen las 6 permutaciones |
| ✅ | Unitaria | `scoring.spec.ts` | asegurados + cupos sorteados = ganadores, con cada regla |
| ✅ | Unitaria | `results.service.spec.ts` | con las awards del sorteo automático: ganadores fijos, sin sorteo y con su nota |
| ✅ | Unitaria | `results.service.spec.ts` | computeResults lee con el cliente que recibe (la transacción del cierre) |
| ✅ | Unitaria | `challenges.service.spec.ts` | cerrar con sorteo guarda a todos los ganadores con la nota reservada, calculando dentro de la transacción |
| ✅ | Unitaria | `challenges.service.spec.ts` | cerrar sin sorteo no crea awards |
| ✅ | API e2e | `close-draw.e2e-spec.ts` | DRAW: al cerrar con empate se sortea una vez y los ganadores no cambian al releer |
| ✅ | API e2e | `close-draw.e2e-spec.ts` | TOTAL_KM: con empate en el corte se guarda al asegurado y al sorteado |

<a id="tc-chal-18"></a>

### TC-CHAL-18 · La premiación del admin reemplaza al sorteo automático; la nota está reservada

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Gestión de retos | Media | Funcional | 6.4 | ✅ Aprobado |

**Precondiciones**

- Un reto cerrado con sorteo automático guardado y un reto activo con empate.

**Datos de prueba:** POST awards con la nota " Sorteo automático al cierre "; POST awards con otra nota; POST awards sobre el activo

**Pasos**

1. Registrar awards con la nota reservada.
2. Registrar la premiación real sobre el cerrado.
3. Premiar el reto activo.
4. Premiar a alguien que no participa.

**Resultado esperado**

- La nota reservada responde 400 "Esa nota está reservada para el sorteo automático", también con espacios alrededor.
- La premiación real reemplaza las awards del sorteo y la nota pasa a "Premiación registrada por el administrador."; el reto sigue cerrado.
- Premiar un reto activo lo cierra con exactamente esas awards y la nota del admin.
- Premiar a quien no participa responde 400 (comprobado bajo el bloqueo del cierre).

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `award-challenge.dto.spec.ts` | rechaza la nota del sorteo automático, también con espacios alrededor |
| ✅ | Unitaria | `award-challenge.dto.spec.ts` | acepta cualquier otra nota |
| ✅ | Unitaria | `results.service.spec.ts` | con una premiación del admin la nota sigue siendo la de siempre |
| ✅ | Unitaria | `challenges.service.spec.ts` | premiar un reto activo lo cierra con exactamente esas awards |
| ✅ | Unitaria | `challenges.service.spec.ts` | premiar un reto cerrado reemplaza las awards sin volver a cerrarlo |
| ✅ | Unitaria | `challenges.service.spec.ts` | solo se premia a participantes, comprobado bajo el lock |
| ✅ | API e2e | `close-draw.e2e-spec.ts` | AWARD: la premiación del admin reemplaza al sorteo automático y la nota reservada se rechaza |
| ✅ | API e2e | `close-draw.e2e-spec.ts` | AWARD: premiar un reto activo lo cierra con exactamente esas awards |

<a id="tc-chal-19"></a>

### TC-CHAL-19 · Resumen previo al cierre (solo lectura, solo admin)

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Gestión de retos | Alta | Funcional | 6.3 | ✅ Aprobado |

**Precondiciones**

- Un reto activo con una actividad pendiente, un impago, un pago parcial, un comprobante sin pago registrado y un pago parcial con un comprobante posterior.

**Datos de prueba:** GET /api/challenges/:id/close-preview como admin y como participante; retos en borrador y cerrado; DRAW con 4 empatados; TOTAL_KM con empate en el corte

**Pasos**

1. Pedir el resumen como admin.
2. Pedirlo para un borrador, para un reto cerrado y como participante.

**Resultado esperado**

- Trae el conteo exacto de pendientes y hasta 50 con nombre y fecha, los comprobantes por revisar (sin pago registrado, o con pago parcial y un comprobante posterior), los impagos y parciales, y la proyección: asegurados, candidatos, cupos y reparto.
- Los comprobantes por revisar son exactamente los de la cola del resumen financiero (proofToReview).
- Con DRAW proyecta 2 cupos entre 4 sin asegurados; con TOTAL_KM, el de más km asegurado y 1 cupo entre los empatados.
- Borrador: 400 "Solo se puede cerrar un reto activo"; cerrado: 400 "El reto ya está cerrado"; participante: 403.
- No cambia nada: el reto sigue activo y no se guarda ningún sorteo.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `results.service.spec.ts` | con DRAW expone la selección sin sortear: nadie asegurado y 2 cupos entre 4 |
| ✅ | Unitaria | `results.service.spec.ts` | con TOTAL_KM y empate en el corte: uno asegurado y 1 cupo entre los empatados |
| ✅ | Unitaria | `results.service.spec.ts` | sin empate no hay sorteo y los ganadores están asegurados |
| ✅ | Unitaria | `challenges.service.spec.ts` | reúne pendientes, comprobantes por revisar, impagos y la proyección |
| ✅ | Unitaria | `challenges.service.spec.ts` | un borrador o un reto cerrado responden 400 |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | PAY: me.paymentStatus recorre pending, in_review, partial y paid, y nadie ve el de otro |
| ✅ | API e2e | `close-draw.e2e-spec.ts` | PREVIEW: el resumen previo reúne pendientes, comprobantes por revisar, impagos y la proyección, sin cambiar nada |
| ✅ | API e2e | `close-draw.e2e-spec.ts` | PREVIEW: con TOTAL_KM y empate en el corte proyecta al asegurado y el cupo sorteado |
| ✅ | API e2e | `close-draw.e2e-spec.ts` | PREVIEW: solo para retos activos (400) y solo para el admin (403) |

<a id="tc-chal-20"></a>

### TC-CHAL-20 · Cerrar o premiar desde la web pasa por la revisión previa

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Gestión de retos | Alta | UI | 6.3 | ✅ Aprobado |

**Precondiciones**

- Sesión de administrador; un reto activo con una actividad pendiente y un impago; otro con un ganador validado.

**Datos de prueba:** Cerrar reto en la lista de retos; Guardar premiación en el ranking; un 409 simulado al cerrar

**Pasos**

1. Pulsar Cerrar reto.
2. Marcar la casilla y confirmar.
3. Guardar la premiación del otro reto.
4. Repetir el cierre con la API respondiendo 409.

**Resultado esperado**

- El diálogo dice que 1 actividad pendiente no contará y bloquea el botón hasta marcar "Cerrar de todas formas"; los impagos aparecen con "Pueden ganar igual" sin bloquear.
- Ganadores y reparto aparecen como proyección; al confirmar, el reto queda Cerrado.
- Guardar premiación abre el diálogo con los premiados elegidos y al confirmar cierra el reto con esa premiación.
- Un 409 se muestra dentro del diálogo con su mensaje y un botón Reintentar.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | UI | `12-assisted-close.spec.ts` | si el cierre está en curso (409) el diálogo muestra el mensaje y ofrece reintentar |
| ✅ | UI | `12-assisted-close.spec.ts` | las pendientes bloquean el cierre hasta confirmarlas; los impagos solo informan |
| ✅ | UI | `12-assisted-close.spec.ts` | guardar la premiación pasa por la revisión y cierra el reto con esos premiados |

<a id="tc-chal-21"></a>

### TC-CHAL-21 · Acta del reto cerrado en CSV (solo admin, solo lectura)

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Gestión de retos | Alta | Funcional | 6.6 | ✅ Aprobado |

**Precondiciones**

- Un reto en COMPLETED con tres participantes: una paga completo y gana, otra paga parte y su nombre empieza con "=", otra no pagó.

**Datos de prueba:** GET /api/challenges/:id/export?format=csv con sesión de administrador; con un participante; con un reto activo; con format=xlsx; con un id inexistente

**Pasos**

1. Descargar el acta del reto cerrado como administrador.
2. Pedirla como participante y sin sesión.
3. Pedirla de un reto en borrador y de uno activo, con un formato desconocido y con un id inexistente.
4. Descargar el acta de un reto cerrado sin participantes.
5. Comparar los datos del reto antes y después de descargarla.

**Resultado esperado**

- 200 con text/csv; charset=utf-8, nombre acta-reto-AAAA-MM.csv, el archivo empieza con la marca BOM y trae la cabecera fija y una fila por participante en el orden del ranking.
- Cada fila trae el reto, periodo, moneda, cuota, pote, posición, días, km, puntaje, estado de pago (pagado, parcial, pendiente), monto y fecha de pago; la persona premiada figura como ganador con su nota y el premio.
- El nombre que empieza con "=" sale con un apóstrofo delante y entre comillas, y un nombre con coma o acentos se conserva entero.
- Un participante recibe 403 y sin sesión 401; un reto en borrador o activo 400 ("Solo se puede exportar el acta de un reto cerrado"); un formato distinto de csv 400; un id inexistente 404.
- Un reto cerrado sin participantes entrega solo la cabecera.
- No incluye enlaces a los comprobantes y no cambia ningún dato del reto.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `challenge-export.spec.ts` | trae la cabecera fija y una fila por participante, con CRLF al final de cada línea |
| ✅ | Unitaria | `challenge-export.spec.ts` | sin participantes solo trae la cabecera |
| ✅ | Unitaria | `challenge-export.spec.ts` | formatea reto, periodo, dinero, km, fechas y booleanos |
| ✅ | Unitaria | `challenge-export.spec.ts` | numera la posición en el orden recibido y marca estado de pago y ganadores con su premio |
| ✅ | Unitaria | `challenge-export.spec.ts` | cita las celdas con comas, comillas o saltos de línea y conserva los acentos |
| ✅ | Unitaria | `challenge-export.spec.ts` | cita los textos con espacios al borde |
| ✅ | Unitaria | `challenge-export.spec.ts` | neutraliza un texto que una planilla leería como fórmula (=, +, -, @, tabulación y retorno) |
| ✅ | Unitaria | `challenge-export.spec.ts` | una fórmula con comillas queda neutralizada y bien citada |
| ✅ | Unitaria | `challenge-export.spec.ts` | no prefija los números: un puntaje negativo seguiría siendo un número |
| ✅ | Unitaria | `challenge-export.spec.ts` | sale solo del año y el mes |
| ✅ | Unitaria | `challenges.service.spec.ts` | arma el acta en el orden del ranking con pagos, premiación guardada y premio |
| ✅ | Unitaria | `challenges.service.spec.ts` | un borrador, un reto activo o uno inexistente no se exportan |
| ✅ | Unitaria | `challenges.service.spec.ts` | sin premiación guardada nadie figura como ganador ni lleva premio |
| ✅ | API e2e | `challenge-export.e2e-spec.ts` | EXPORT: un participante recibe 403 y sin sesión 401 |
| ✅ | API e2e | `challenge-export.e2e-spec.ts` | EXPORT: un reto activo o en borrador responde 400, un formato desconocido 400 y uno inexistente 404 |
| ✅ | API e2e | `challenge-export.e2e-spec.ts` | EXPORT: el reto cerrado se descarga como CSV con BOM, cabecera y una fila por participante en orden de ranking |
| ✅ | API e2e | `challenge-export.e2e-spec.ts` | EXPORT: el pago, la premiación guardada y el premio salen de lo que muestra la plataforma |
| ✅ | API e2e | `challenge-export.e2e-spec.ts` | EXPORT: no incluye enlaces de comprobantes y no cambia ningún dato del reto |
| ✅ | API e2e | `challenge-export.e2e-spec.ts` | EXPORT: un reto cerrado sin participantes entrega solo la cabecera |

<a id="tc-chal-22"></a>

### TC-CHAL-22 · Descargar el acta desde el ranking de un reto cerrado

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Gestión de retos | Media | UI | 6.6 | ✅ Aprobado |

**Precondiciones**

- Un reto en COMPLETED con la premiación de Ana registrada (cuota 300 BOB, pagada por Ana).

**Datos de prueba:** Ranking del reto cerrado como administrador y como participante; una respuesta 400 simulada

**Pasos**

1. Como participante, abrir el ranking del reto cerrado.
2. Como administrador, abrir el mismo ranking y pulsar "Descargar acta (CSV)".
3. Repetir con la API respondiendo 400.

**Resultado esperado**

- El participante no ve la descarga del acta.
- El administrador descarga acta-reto-2025-11.csv con la marca BOM, la cabecera y la fila de Ana: pagado, 300.00, ganadora con su nota y el premio de 300.00.
- Si la descarga falla, el mensaje de la API se ve junto al botón.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | UI | `08-closed-results.spec.ts` | el participante no ve la descarga del acta |
| ✅ | UI | `08-closed-results.spec.ts` | el acta del reto cerrado se descarga en CSV con el ranking, el pago y el premio |
| ✅ | UI | `08-closed-results.spec.ts` | si la descarga falla, el error se ve junto al botón |
| ✅ | Web (unitaria) | `export.test.ts` | el nombre del acta sale del año y el mes con dos dígitos |

<a id="part"></a>

## Participantes y pagos

| ID | Caso | Prioridad | Tipo | Estado |
|---|---|---|---|---|
| [TC-PART-01](#tc-part-01) | Inscribir participantes | Alta | Funcional | ✅ Aprobado |
| [TC-PART-02](#tc-part-02) | Inscripción duplicada | Media | Negativo | ✅ Aprobado |
| [TC-PART-03](#tc-part-03) | Quitar a un participante | Media | Funcional | ✅ Aprobado |
| [TC-PART-04](#tc-part-04) | Registrar el pago de un participante | Alta | Funcional | ✅ Aprobado |
| [TC-PART-05](#tc-part-05) | Comprobante de pago del participante | Media | Funcional | ✅ Aprobado |
| [TC-PART-07](#tc-part-07) | Estado de pago propio en el inicio del participante | Alta | Funcional | ✅ Aprobado |
| [TC-PART-06](#tc-part-06) | Reto cerrado: sin altas ni bajas | Media | Negativo | ✅ Aprobado |

<a id="tc-part-01"></a>

### TC-PART-01 · Inscribir participantes

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Participantes y pagos | Alta | Funcional | 3.1 | ✅ Aprobado |

**Precondiciones**

- Reto existente; usuarios registrados.

**Datos de prueba:** POST /api/challenges/:id/participants { userId } para 5 usuarios

**Pasos**

1. Inscribir a cada usuario.

**Resultado esperado**

- 201 por cada inscripción y los 5 aparecen en el reto.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `challenge-finance.e2e-spec.ts` | admin crea el reto (cuota 120, presupuesto 600) e inscribe 5 participantes |

<a id="tc-part-02"></a>

### TC-PART-02 · Inscripción duplicada

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Participantes y pagos | Media | Negativo | 3.1 | ✅ Aprobado |

**Precondiciones**

- El usuario ya está inscrito.

**Datos de prueba:** Mismo userId

**Pasos**

1. Inscribirlo otra vez.

**Resultado esperado**

- 409 "El usuario ya participa en este reto".

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | PART: inscribir dos veces a la misma persona devuelve 409 |

<a id="tc-part-03"></a>

### TC-PART-03 · Quitar a un participante

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Participantes y pagos | Media | Funcional | 3.2 | ✅ Aprobado |

**Precondiciones**

- Participante inscrito en un reto activo.

**Datos de prueba:** DELETE /api/challenges/:id/participants/:userId

**Pasos**

1. Quitarlo.
2. Leer la lista de participantes.

**Resultado esperado**

- 204 y ya no aparece en la lista.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | PART: quitar a un participante lo saca de la lista (204) |

<a id="tc-part-04"></a>

### TC-PART-04 · Registrar el pago de un participante

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Participantes y pagos | Alta | Funcional | 3.3 | ✅ Aprobado |

**Precondiciones**

- Reto con cuota 120.

**Datos de prueba:** PATCH .../payment { paid: true }, { paid: true, amountPaid: 60 }, { paid: false }

**Pasos**

1. Marcar pagado sin monto.
2. Marcar pagado con monto.
3. Marcar impago.

**Resultado esperado**

- Sin monto registra la cuota y paidAt.
- Con monto respeta el monto.
- Impago limpia monto y fecha.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `challenges.service.spec.ts` | pagado sin monto registra la cuota del reto |
| ✅ | Unitaria | `challenges.service.spec.ts` | pagado con monto explícito respeta el monto |
| ✅ | Unitaria | `challenges.service.spec.ts` | impago limpia monto y fecha |
| ✅ | Unitaria | `challenges.service.spec.ts` | en un reto activo, pagar sin monto registra la cuota |
| ✅ | API e2e | `challenge-finance.e2e-spec.ts` | marcar pagado sin monto registra la cuota; con monto lo respeta |

<a id="tc-part-05"></a>

### TC-PART-05 · Comprobante de pago del participante

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Participantes y pagos | Media | Funcional | 4.2 | ✅ Aprobado |

**Precondiciones**

- Participante inscrito.

**Datos de prueba:** Imagen o PDF del comprobante

**Pasos**

1. En Mi reto, pulsar Subir comprobante y elegir el archivo.
2. Como admin, abrir Participantes.

**Resultado esperado**

- Se guarda paymentProofUrl y aparece "Ver comprobante cargado".
- El comprobante no marca el pago: paid sigue en false hasta que el admin lo marca.
- El admin ve "Ver comprobante de pago" y el comprobante entra en su cola "Por revisar".
- El inicio del participante dice "Estado: comprobante en revisión" con la fecha de subida.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | PART: el participante sube su comprobante de pago |
| ✅ | API e2e | `challenge-finance.e2e-spec.ts` | cola de comprobantes: un comprobante entra, registrar el pago lo saca y nunca suma al recaudado |
| ✅ | UI | `11-privacy.spec.ts` | el dashboard muestra pendiente de pago, comprobante en revisión, pago parcial y pagado |
| ✅ | Guía | `capture.spec.ts` | comprobante de pago disponible para el participante |
| ✅ | Guía | `capture.spec.ts` | participantes con resumen financiero |

<a id="tc-part-07"></a>

### TC-PART-07 · Estado de pago propio en el inicio del participante

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Participantes y pagos | Alta | Funcional | 4.2 | ✅ Aprobado |

**Precondiciones**

- Reto con cuota 50 y Ana inscrita.
- Un reto gratuito.

**Datos de prueba:** Ana sin comprobante ni pago; con comprobante; con pago de 20; con pago de 50; reto con cuota 0

**Pasos**

1. Abrir el inicio como Ana en cada estado.
2. Leer me.paymentStatus de GET /api/challenges/active/list.
3. Abrir el inicio en un reto sin cuota.

**Resultado esperado**

- Sin nada: "Estado: pendiente de pago", pide subir el comprobante y ofrece "Subir comprobante"; paymentStatus pending.
- Con comprobante y sin pago: "Estado: comprobante en revisión" con la fecha de subida; in_review.
- Con 20 de 50 registrados: "Estado: pago parcial · pagaste 20 de 50 BOB, faltan 30"; partial. Un comprobante posterior a ese pago vuelve a in_review.
- Con 50 de 50: "Estado: pagado"; paid.
- Reto sin cuota: "Este reto no tiene cuota", paymentStatus paid y sin botón de subir comprobante.
- Nadie ve el estado de pago de otra persona: solo me lo trae.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `finance.service.spec.ts` | pending: sin pago ni comprobante |
| ✅ | Unitaria | `finance.service.spec.ts` | in_review: comprobante sin pago registrado |
| ✅ | Unitaria | `finance.service.spec.ts` | in_review también con pago parcial y comprobante más nuevo |
| ✅ | Unitaria | `finance.service.spec.ts` | partial: pago parcial sin nada por revisar |
| ✅ | Unitaria | `finance.service.spec.ts` | paid: pago completo, aunque suba otro comprobante |
| ✅ | Unitaria | `finance.service.spec.ts` | paid siempre en un reto gratuito |
| ✅ | Unitaria | `privacy.spec.ts` | paymentStatus: pending, in_review, partial y paid según el pago propio |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | PAY: me.paymentStatus recorre pending, in_review, partial y paid, y nadie ve el de otro |
| ✅ | UI | `11-privacy.spec.ts` | el dashboard muestra pendiente de pago, comprobante en revisión, pago parcial y pagado |
| ✅ | UI | `11-privacy.spec.ts` | un reto gratuito dice que no tiene cuota y no ofrece subir comprobante |
| ✅ | Guía | `capture.spec.ts` | estado de pago propio: comprobante en revisión |

<a id="tc-part-06"></a>

### TC-PART-06 · Reto cerrado: sin altas ni bajas

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Participantes y pagos | Media | Negativo | 6.3 | ✅ Aprobado |

**Precondiciones**

- Reto en COMPLETED.

**Datos de prueba:** Inscribir y quitar en el reto cerrado

**Pasos**

1. Intentar inscribir.
2. Intentar quitar.

**Resultado esperado**

- 400 "No se puede modificar un reto cerrado" en ambos.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | PART: en un reto cerrado no se inscribe ni se quita a nadie (400) |

<a id="act"></a>

## Actividades y validación

| ID | Caso | Prioridad | Tipo | Estado |
|---|---|---|---|---|
| [TC-ACT-01](#tc-act-01) | Registrar la actividad del día | Alta | Funcional | ✅ Aprobado |
| [TC-ACT-02](#tc-act-02) | Foto obligatoria | Alta | Negativo | ✅ Aprobado |
| [TC-ACT-03](#tc-act-03) | Fecha fuera del período | Alta | Negativo | ✅ Aprobado |
| [TC-ACT-04](#tc-act-04) | Día de la semana no habilitado | Alta | Negativo | ✅ Aprobado |
| [TC-ACT-05](#tc-act-05) | Una actividad por día y reto | Alta | Negativo | ✅ Aprobado |
| [TC-ACT-06](#tc-act-06) | Solo los inscritos registran | Alta | Seguridad | ✅ Aprobado |
| [TC-ACT-07](#tc-act-07) | Solo en retos activos | Alta | Negativo | ✅ Aprobado |
| [TC-ACT-08](#tc-act-08) | Validar una actividad conforme | Alta | Funcional | ✅ Aprobado |
| [TC-ACT-09](#tc-act-09) | Rechazar con motivo | Alta | Funcional | ✅ Aprobado |
| [TC-ACT-10](#tc-act-10) | Mis actividades | Alta | Seguridad | ✅ Aprobado |
| [TC-ACT-11](#tc-act-11) | Listados y pendientes solo para el admin | Alta | Seguridad | ✅ Aprobado |
| [TC-ACT-12](#tc-act-12) | Retirar una actividad | Media | Funcional | ✅ Aprobado |
| [TC-ACT-13](#tc-act-13) | Regla de FC: registro por debajo del mínimo | Alta | Negativo | ✅ Aprobado |
| [TC-ACT-14](#tc-act-14) | Regla de FC: registro conforme | Alta | Funcional | ✅ Aprobado |
| [TC-ACT-15](#tc-act-15) | Validar una actividad no conforme exige nota | Alta | Funcional | ✅ Aprobado |
| [TC-ACT-16](#tc-act-16) | Importación con minutos de FC y advertencias | Media | Funcional | ✅ Aprobado |
| [TC-ACT-17](#tc-act-17) | Reto sin regla de FC | Media | Funcional | ✅ Aprobado |
| [TC-ACT-18](#tc-act-18) | Formulario de subida guiado | Alta | UI | ✅ Aprobado |
| [TC-ACT-19](#tc-act-19) | El rechazo exige un motivo | Media | Negativo | ✅ Aprobado |

<a id="tc-act-01"></a>

### TC-ACT-01 · Registrar la actividad del día

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Actividades y validación | Alta | Funcional | 4.3 | ✅ Aprobado |

**Precondiciones**

- Participante inscrito en un reto ACTIVE; día válido dentro del período.

**Datos de prueba:** Carrera, 45 min, 7.2 km, 30 min de FC, foto del entreno + captura de FC

**Pasos**

1. Abrir Subir actividad.
2. Completar los datos y adjuntar las fotos.
3. Pulsar Registrar actividad.

**Resultado esperado**

- 201 con la actividad en PENDING.
- Aparece en Mis actividades con la fecha exacta registrada.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | UI | `02-activity-upload.spec.ts` | registra la actividad y la muestra con su fecha exacta |
| ✅ | Sesiones | `parallel-session-test.mjs` | Se registró una actividad nueva |

<a id="tc-act-02"></a>

### TC-ACT-02 · Foto obligatoria

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Actividades y validación | Alta | Negativo | 4.3 | ✅ Aprobado |

**Precondiciones**

- Participante inscrito.

**Datos de prueba:** photos: []

**Pasos**

1. POST /api/activities sin fotos.

**Resultado esperado**

- 400 "Al menos una foto/captura es obligatoria".

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | ACT: sin fotos la actividad se rechaza (400) |

<a id="tc-act-03"></a>

### TC-ACT-03 · Fecha fuera del período

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Actividades y validación | Alta | Negativo | 4.3 | ✅ Aprobado |

**Precondiciones**

- Participante inscrito.

**Datos de prueba:** Fecha anterior al inicio o posterior al fin

**Pasos**

1. POST /api/activities con esa fecha.

**Resultado esperado**

- 400 "La fecha está fuera del período del reto".

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | ACT: una fecha fuera del período se rechaza (400) |

<a id="tc-act-04"></a>

### TC-ACT-04 · Día de la semana no habilitado

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Actividades y validación | Alta | Negativo | 4.3 | ✅ Aprobado |

**Precondiciones**

- Reto de lunes a sábado.

**Datos de prueba:** Un domingo dentro del período

**Pasos**

1. POST /api/activities en domingo.

**Resultado esperado**

- 400 "Ese día de la semana no es válido para este reto".

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | ACT: un día de la semana no habilitado se rechaza (400) |

<a id="tc-act-05"></a>

### TC-ACT-05 · Una actividad por día y reto

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Actividades y validación | Alta | Negativo | 4.3 | ✅ Aprobado |

**Precondiciones**

- Ya existe una actividad del participante para la fecha.

**Datos de prueba:** Misma fecha y reto

**Pasos**

1. Registrar otra actividad ese día (web y API).

**Resultado esperado**

- 409 "Ya registraste una actividad para ese día".
- La web muestra el error y no duplica.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | UI | `02-activity-upload.spec.ts` | rechaza una segunda actividad para el mismo día |
| ✅ | API e2e | `challenge-lifecycle.e2e-spec.ts` | actividades por reto: misma fecha en A y B (201 x2), duplicado en A -> 409, rankings independientes |

<a id="tc-act-06"></a>

### TC-ACT-06 · Solo los inscritos registran

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Actividades y validación | Alta | Seguridad | 4.3 | ✅ Aprobado |

**Precondiciones**

- Usuario no inscrito en el reto.

**Datos de prueba:** e2e-rules-outsider

**Pasos**

1. POST /api/activities en ese reto.

**Resultado esperado**

- 403 "No participas en este reto".

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | ACT: quien no está inscrito no puede registrar (403) |

<a id="tc-act-07"></a>

### TC-ACT-07 · Solo en retos activos

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Actividades y validación | Alta | Negativo | 4.3 | ✅ Aprobado |

**Precondiciones**

- Reto en DRAFT o COMPLETED.

**Datos de prueba:** Actividad válida en cualquier otro aspecto

**Pasos**

1. Registrar en un reto DRAFT.
2. Registrar en un reto COMPLETED.

**Resultado esperado**

- 400 "El reto no está activo" en ambos.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | ACT: en un reto que no está activo no se registra (400) |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | ACT: en un reto cerrado no se registran actividades (400) |

<a id="tc-act-08"></a>

### TC-ACT-08 · Validar una actividad conforme

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Actividades y validación | Alta | Funcional | 5.2 | ✅ Aprobado |

**Precondiciones**

- Actividad PENDING que cumple la regla de FC.

**Datos de prueba:** POST /api/activities/:id/validate sin cuerpo

**Pasos**

1. En Validaciones pulsar Validar.
2. El participante consulta sus actividades.

**Resultado esperado**

- VALIDATED con validatedAt/validatedById y validationNote null.
- La tarjeta sale de la lista y el participante la ve validada.
- Suma al ranking.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `activities.service.spec.ts` | valida una actividad conforme sin cuerpo y sin nota |
| ✅ | UI | `03-admin-validation.spec.ts` | valida una actividad conforme con un clic |
| ✅ | Sesiones | `parallel-session-test.mjs` | Admin valida la actividad de Ana |
| ✅ | Sesiones | `parallel-session-test.mjs` | Ana ve su actividad VALIDATED |

<a id="tc-act-09"></a>

### TC-ACT-09 · Rechazar con motivo

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Actividades y validación | Alta | Funcional | 5.3 | ✅ Aprobado |

**Precondiciones**

- Actividad PENDING.

**Datos de prueba:** reason "La captura no muestra los minutos de FC"

**Pasos**

1. Pulsar Rechazar, escribir el motivo y confirmar.
2. El participante abre Mis actividades.

**Resultado esperado**

- REJECTED con rejectionReason guardado.
- El participante ve el estado Rechazado y el motivo.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | VAL: el rechazo guarda el motivo y el participante lo ve |
| ✅ | Guía | `capture.spec.ts` | mis actividades con validada, pendiente y rechazada |
| ✅ | Guía | `capture.spec.ts` | validaciones: chips, override y rechazo |

<a id="tc-act-10"></a>

### TC-ACT-10 · Mis actividades

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Actividades y validación | Alta | Seguridad | 4.4 | ✅ Aprobado |

**Precondiciones**

- Dos participantes con actividades.

**Datos de prueba:** GET /api/activities/me

**Pasos**

1. Consultar como cada participante.

**Resultado esperado**

- Cada uno recibe solo sus actividades, con su estado.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | ACT: cada participante solo ve sus propias actividades |
| ✅ | Sesiones | `parallel-session-test.mjs` | Ana ve sus actividades |

<a id="tc-act-11"></a>

### TC-ACT-11 · Listados y pendientes solo para el admin

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Actividades y validación | Alta | Seguridad | 5.1 | ✅ Aprobado |

**Precondiciones**

- Actividades pendientes en el reto.

**Datos de prueba:** GET /api/activities y /api/activities/pending

**Pasos**

1. Consultar como participante.
2. Consultar como admin.

**Resultado esperado**

- Participante: 403 en ambos.
- Admin: recibe las pendientes, cada una con heartRateCompliant según la regla de su reto (chip Cumple / No cumple FC).

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `activities.service.spec.ts` | marca cada actividad según la regla de su reto |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | RBAC: el participante no lista todas las actividades ni las pendientes (403) |
| ✅ | Sesiones | `parallel-session-test.mjs` | Admin ve actividades pendientes |
| ✅ | Sesiones | `parallel-session-test.mjs` | Ana NO puede listar todas las actividades (403) |
| ✅ | Guía | `capture.spec.ts` | validaciones: chips, override y rechazo |

<a id="tc-act-12"></a>

### TC-ACT-12 · Retirar una actividad

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Actividades y validación | Media | Funcional | 4.5 | ✅ Aprobado |

**Precondiciones**

- Actividades propias PENDING y VALIDATED; actividad ajena.
- Web: el navegador con fecha 2025-01-06, dentro del reto de prueba, y una actividad pendiente ese día.

**Datos de prueba:** Web: Mis actividades > Retirar (Cancelar y luego Sí, retirar). API: DELETE /api/activities/:id

**Pasos**

1. En Mis actividades pulsar Retirar y cancelar.
2. Pulsar Retirar y confirmar.
3. Ver una actividad validada.
4. Por API: borrar la propia pendiente, una ajena y la propia validada; luego como admin.

**Resultado esperado**

- Cancelar no borra nada.
- Al confirmar, la actividad desaparece, Pendientes baja a 0 y vuelve "Subir actividad de hoy".
- Las validadas y rechazadas no ofrecen Retirar.
- API: propia pendiente 204; ajena 403; validada 403 para el participante y 204 para el admin.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | UI | `10-api-only-actions.spec.ts` | retira una actividad pendiente con confirmación y el día queda libre otra vez |
| ✅ | UI | `10-api-only-actions.spec.ts` | las actividades validadas o rechazadas no ofrecen retirar |
| ✅ | Guía | `capture.spec.ts` | retirar una actividad pendiente pide confirmación |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | ACT: el participante borra su actividad pendiente (204) |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | ACT: el participante no puede borrar actividades ajenas (403) |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | ACT: el participante no puede borrar una actividad ya validada (403); el admin sí |

<a id="tc-act-13"></a>

### TC-ACT-13 · Regla de FC: registro por debajo del mínimo

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Actividades y validación | Alta | Negativo | 4.3 | ✅ Aprobado |

**Precondiciones**

- Reto ACTIVE con minHeartRateMinutes 30.

**Datos de prueba:** 20 min de FC con captura; 35 min sin foto HEART_RATE; captura sin minutos; minutos de FC > duración

**Pasos**

1. POST /api/activities con cada combinación.

**Resultado esperado**

- 400 en todas; el mensaje del primer caso menciona 30.
- hasHeartRateProof se deriva de las fotos, no del flag enviado.
- No se crea ninguna actividad.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `activities.service.spec.ts` | no cumple si los minutos están por debajo del mínimo (menciona el mínimo) |
| ✅ | Unitaria | `activities.service.spec.ts` | no cumple si faltan los minutos |
| ✅ | Unitaria | `activities.service.spec.ts` | no cumple sin captura de FC |
| ✅ | Unitaria | `activities.service.spec.ts` | rechaza minutos con FC mayores a la duración |
| ✅ | Unitaria | `activities.service.spec.ts` | rechaza una actividad por debajo del mínimo mencionando el mínimo |
| ✅ | Unitaria | `activities.service.spec.ts` | deriva hasHeartRateProof de las fotos: sin foto HEART_RATE se rechaza aunque el flag venga true |
| ✅ | API e2e | `activity-heart-rate.e2e-spec.ts` | rechaza registro con 20 min de FC en un reto de 30 (mensaje menciona 30) |
| ✅ | API e2e | `activity-heart-rate.e2e-spec.ts` | rechaza registro sin foto HEART_RATE aunque tenga minutos suficientes |
| ✅ | API e2e | `activity-heart-rate.e2e-spec.ts` | rechaza registro con captura pero sin heartRateMinutes |
| ✅ | API e2e | `activity-heart-rate.e2e-spec.ts` | rechaza heartRateMinutes mayor que durationMinutes |

<a id="tc-act-14"></a>

### TC-ACT-14 · Regla de FC: registro conforme

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Actividades y validación | Alta | Funcional | 4.3 | ✅ Aprobado |

**Precondiciones**

- Reto con mínimo 30.

**Datos de prueba:** 45 min, 35 min de FC, fotos ACTIVITY + HEART_RATE, hasHeartRateProof enviado en false

**Pasos**

1. POST /api/activities.

**Resultado esperado**

- 201 con hasHeartRateProof true (derivado) y heartRateCompliant true.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `activities.service.spec.ts` | cumple con minutos >= mínimo y captura |
| ✅ | Unitaria | `activities.service.spec.ts` | crea una actividad conforme con heartRateCompliant=true y el flag derivado |
| ✅ | API e2e | `activity-heart-rate.e2e-spec.ts` | registra una actividad conforme: hasHeartRateProof derivado y heartRateCompliant=true |

<a id="tc-act-15"></a>

### TC-ACT-15 · Validar una actividad no conforme exige nota

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Actividades y validación | Alta | Funcional | 5.2 | ✅ Aprobado |

**Precondiciones**

- Actividad PENDING sin la FC mínima (p. ej. importada).

**Datos de prueba:** validate sin cuerpo; { override: true }; { override: true, note: "Corrió con el grupo" }

**Pasos**

1. Validar sin cuerpo.
2. Validar con override sin nota.
3. Validar con override y nota (web: pulsar Validar, escribir la nota y Validar con nota).

**Resultado esperado**

- 400, 400 y luego VALIDATED.
- validationNote guarda la nota y heartRateCompliant sigue false.
- La web pide la nota antes de enviar.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `activities.service.spec.ts` | rechaza validar una actividad no conforme sin override |
| ✅ | Unitaria | `activities.service.spec.ts` | rechaza override sin nota |
| ✅ | Unitaria | `activities.service.spec.ts` | valida con override y guarda la nota; heartRateCompliant sigue false |
| ✅ | API e2e | `activity-heart-rate.e2e-spec.ts` | validar una actividad no conforme requiere override + nota |
| ✅ | API e2e | `activity-heart-rate.e2e-spec.ts` | validar una actividad conforme no requiere cuerpo y deja validationNote null |
| ✅ | UI | `03-admin-validation.spec.ts` | una actividad que no cumple la regla de FC exige nota de override |
| ✅ | Guía | `capture.spec.ts` | validaciones: chips, override y rechazo |

<a id="tc-act-16"></a>

### TC-ACT-16 · Importación con minutos de FC y advertencias

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Actividades y validación | Media | Funcional | 7.2 | ✅ Aprobado |

**Precondiciones**

- Reto con mínimo 20.

**Datos de prueba:** CSV con una fila sin FC, una conforme y una con minutos de FC > duración

**Pasos**

1. Previsualizar el archivo.

**Resultado esperado**

- La fila sin FC es válida con advertencia que menciona el mínimo (summary.warnings = 1).
- Minutos de FC > duración es error de la fila.
- La plantilla trae la columna heartRateMinutes.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `import.service.spec.ts` | parsea heartRateMinutes |
| ✅ | Unitaria | `import.service.spec.ts` | rechaza heartRateMinutes mayor que durationMinutes |
| ✅ | Unitaria | `import.service.spec.ts` | preview: fila sin FC en un reto con mínimo -> válida con advertencia |
| ✅ | API e2e | `activity-heart-rate.e2e-spec.ts` | la plantilla de importación incluye heartRateMinutes y el preview reporta warnings |

<a id="tc-act-17"></a>

### TC-ACT-17 · Reto sin regla de FC

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Actividades y validación | Media | Funcional | 2.1 | ✅ Aprobado |

**Precondiciones**

- Reto con minHeartRateMinutes 0.

**Datos de prueba:** Actividad sin minutos de FC ni captura

**Pasos**

1. Crear y activar el reto.
2. Registrar la actividad.

**Resultado esperado**

- 201 y heartRateCompliant true: la regla no aplica.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `activities.service.spec.ts` | un reto con mínimo 0 no aplica la regla |
| ✅ | Unitaria | `activities.service.spec.ts` | con mínimo 0 acepta actividades sin minutos ni captura |
| ✅ | API e2e | `activity-heart-rate.e2e-spec.ts` | admin crea un reto estricto (30 min) y uno sin regla (0) y activa ambos |
| ✅ | API e2e | `activity-heart-rate.e2e-spec.ts` | en el reto sin regla acepta actividades sin minutos ni captura |

<a id="tc-act-18"></a>

### TC-ACT-18 · Formulario de subida guiado

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Actividades y validación | Alta | UI | 4.3 | ✅ Aprobado |

**Precondiciones**

- Reto con mínimo de FC seleccionado.

**Datos de prueba:** 12 min de FC; luego minutos suficientes con captura y foto

**Pasos**

1. Ingresar minutos por debajo del mínimo.
2. Completar minutos, captura y foto.

**Resultado esperado**

- Con minutos insuficientes el botón Registrar actividad queda deshabilitado y un aviso explica el mínimo.
- Con todo en regla el botón se habilita.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | UI | `02-activity-upload.spec.ts` | el formulario guía y bloquea hasta cumplir la regla de FC |
| ✅ | Guía | `capture.spec.ts` | formulario de subida bloqueado y listo |

<a id="tc-act-19"></a>

### TC-ACT-19 · El rechazo exige un motivo

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Actividades y validación | Media | Negativo | 5.3 | ✅ Aprobado |

**Precondiciones**

- Actividad PENDING.

**Datos de prueba:** reason "no" (2 caracteres)

**Pasos**

1. POST /api/activities/:id/reject con el motivo corto.

**Resultado esperado**

- 400; la actividad sigue PENDING.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | VAL: rechazar exige un motivo de al menos 3 caracteres (400) |

<a id="res"></a>

## Resultados y premiación

| ID | Caso | Prioridad | Tipo | Estado |
|---|---|---|---|---|
| [TC-RES-01](#tc-res-01) | Ranking y ganador automático | Alta | Funcional | ✅ Aprobado |
| [TC-RES-02](#tc-res-02) | Empate dentro del cupo de ganadores | Alta | Funcional | ✅ Aprobado |
| [TC-RES-03](#tc-res-03) | Empate que supera el cupo: sorteo | Alta | Funcional | ✅ Aprobado |
| [TC-RES-04](#tc-res-04) | La premiación manual prevalece | Alta | Funcional | ✅ Aprobado |
| [TC-RES-05](#tc-res-05) | Solo se premia a participantes | Media | Negativo | ✅ Aprobado |
| [TC-RES-06](#tc-res-06) | El panel de premiación sugiere a los ganadores de las reglas | Media | Regresión | ✅ Aprobado |

<a id="tc-res-01"></a>

### TC-RES-01 · Ranking y ganador automático

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Resultados y premiación | Alta | Funcional | 6.1 | ✅ Aprobado |

**Precondiciones**

- Reto con actividades validadas.

**Datos de prueba:** GET /api/challenges/:id/results

**Pasos**

1. Consultar los resultados.

**Resultado esperado**

- ranking ordenado por puntaje y, a igual puntaje, por km.
- Un único líder es el ganador; sin validadas no hay ganador.
- winners, tiedAtTop, drawNeeded y notes son coherentes.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `results.service.spec.ts` | declara un ganador único |
| ✅ | Unitaria | `results.service.spec.ts` | sin actividades validadas -> sin ganador |
| ✅ | Sesiones | `parallel-session-test.mjs` | Hay ranking |
| ✅ | Sesiones | `parallel-session-test.mjs` | Top del ranking calculado |

<a id="tc-res-02"></a>

### TC-RES-02 · Empate dentro del cupo de ganadores

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Resultados y premiación | Alta | Funcional | 6.2 | ✅ Aprobado |

**Precondiciones**

- 2 participantes empatados en el tope; maxWinners 2.

**Datos de prueba:** Mismo puntaje

**Pasos**

1. Consultar los resultados.

**Resultado esperado**

- Ambos ganan, sin sorteo (drawNeeded false), y el premio se divide.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `results.service.spec.ts` | empate de 2 -> ambos ganan sin sorteo |
| ✅ | Unitaria | `scoring.spec.ts` | empate dentro del cupo: ganan todos sin sorteo |

<a id="tc-res-03"></a>

### TC-RES-03 · Empate que supera el cupo: sorteo

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Resultados y premiación | Alta | Funcional | 6.2 | ✅ Aprobado |

**Precondiciones**

- 3 o más empatados en el tope; tiebreakRule DRAW; maxWinners 2.

**Datos de prueba:** Mismo puntaje

**Pasos**

1. Consultar los resultados.

**Resultado esperado**

- drawNeeded true y winners con 2 elegidos al azar entre los empatados.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `scoring.spec.ts` | DRAW con más empatados que cupos: sortea entre los empatados |

<a id="tc-res-04"></a>

### TC-RES-04 · La premiación manual prevalece

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Resultados y premiación | Alta | Funcional | 6.4 | ✅ Aprobado |

**Precondiciones**

- Reto activo con ranking.

**Datos de prueba:** POST /api/challenges/:id/awards { userIds: [bruno], notes }

**Pasos**

1. Registrar la premiación.
2. Consultar los resultados.

**Resultado esperado**

- El reto pasa a COMPLETED.
- winners = premiados aunque el cálculo diga otra cosa; payout reparte lo recaudado entre ellos (Bruno pagó 100 y Ana 50: pote 150 para 1 premiado, aunque el presupuesto sea 300).
- Nota "Premiación registrada por el administrador".

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `results.service.spec.ts` | una premiación registrada manda sobre el cálculo automático |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | RES: la premiación manual prevalece, reparte el premio y cierra el reto |

<a id="tc-res-05"></a>

### TC-RES-05 · Solo se premia a participantes

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Resultados y premiación | Media | Negativo | 6.4 | ✅ Aprobado |

**Precondiciones**

- Usuario que no participa en el reto.

**Datos de prueba:** userIds con el id ajeno

**Pasos**

1. Registrar la premiación.

**Resultado esperado**

- 400 "Solo se puede premiar a participantes del reto".

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | RES: no se puede premiar a quien no participa (400) |

<a id="tc-res-06"></a>

### TC-RES-06 · El panel de premiación sugiere a los ganadores de las reglas

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Resultados y premiación | Media | Regresión | 6.4 | ✅ Aprobado |

> Relacionado con DEF-04 (ver reporte de validación).

**Precondiciones**

- Reto de demostración: 1 ganador, desempate por km; Ana lidera con 96 puntos.

**Datos de prueba:** Panel de premiación en Ranking (admin)

**Pasos**

1. Abrir Ranking como administrador.

**Resultado esperado**

- Viene marcada solo Ana (ganadora según las reglas).
- Carla y Diego (no califica) aparecen sin marcar.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Guía | `capture.spec.ts` | panel de premiación |

<a id="score"></a>

## Reglas de puntaje

| ID | Caso | Prioridad | Tipo | Estado |
|---|---|---|---|---|
| [TC-SCORE-01](#tc-score-01) | Puntaje configurable | Alta | Funcional | ✅ Aprobado |
| [TC-SCORE-02](#tc-score-02) | Mínimo de días para calificar | Alta | Funcional | ✅ Aprobado |
| [TC-SCORE-03](#tc-score-03) | Número de ganadores y desempate | Alta | Funcional | ✅ Aprobado |
| [TC-SCORE-04](#tc-score-04) | Validación de la configuración de puntaje | Media | Negativo | ✅ Aprobado |
| [TC-SCORE-05](#tc-score-05) | Ranking web con reglas propias | Media | UI | ✅ Aprobado |
| [TC-SCORE-06](#tc-score-06) | Notas de la regla y compatibilidad | Media | Funcional | ✅ Aprobado |
| [TC-SCORE-07](#tc-score-07) | El tope se muestra en la unidad del reto | Media | Regresión | ✅ Aprobado |

<a id="tc-score-01"></a>

### TC-SCORE-01 · Puntaje configurable

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Reglas de puntaje | Alta | Funcional | 6.1 | ✅ Aprobado |

**Precondiciones**

- Reto con 10 puntos por día validado y 1 por km.

**Datos de prueba:** 3 días validados y 12.5 km

**Pasos**

1. Consultar los resultados.

**Resultado esperado**

- score = 42.5 y los km reordenan el ranking.
- Con los defaults (1 y 0) score = días validados.
- Los decimales de Prisma se redondean a 2.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `scoring.spec.ts` | con los defaults el puntaje son los días validados |
| ✅ | Unitaria | `scoring.spec.ts` | suma puntos por kilómetro cuando el reto lo configura |
| ✅ | Unitaria | `scoring.spec.ts` | acepta decimales de Prisma (string) y redondea a 2 |
| ✅ | Unitaria | `scoring.spec.ts` | sin actividades validadas el puntaje es 0 |
| ✅ | Unitaria | `results.service.spec.ts` | los kilómetros suman puntos y reordenan el ranking |
| ✅ | Sesiones | `parallel-session-test.mjs` | El ranking expone score y qualified |
| ✅ | Sesiones | `parallel-session-test.mjs` | Con los defaults el puntaje son los días validados |

<a id="tc-score-02"></a>

### TC-SCORE-02 · Mínimo de días para calificar

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Reglas de puntaje | Alta | Funcional | 6.1 | ✅ Aprobado |

**Precondiciones**

- Reto con minValidatedDaysToQualify 2; el de mayor puntaje tiene 1 día.

**Datos de prueba:** GET results

**Pasos**

1. Consultar los resultados.

**Resultado esperado**

- Aparece con qualified false, no entra en tiedAtTop ni gana.
- Si nadie califica no hay ganador y payout.winnersCount = 0.
- Con el default se exige al menos un punto.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `scoring.spec.ts` | con el default exige al menos un punto |
| ✅ | Unitaria | `scoring.spec.ts` | respeta el mínimo de días validados |
| ✅ | Unitaria | `results.service.spec.ts` | el mínimo de días validados deja fuera al puntero y sin ganador |
| ✅ | API e2e | `challenge-scoring.e2e-spec.ts` | el ranking expone score y qualified, y el mínimo deja fuera al de mayor puntaje |

<a id="tc-score-03"></a>

### TC-SCORE-03 · Número de ganadores y desempate

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Reglas de puntaje | Alta | Funcional | 6.2 | ✅ Aprobado |

**Precondiciones**

- Empate en el tope.

**Datos de prueba:** maxWinners 1 con TOTAL_KM; DRAW; SHARE_ALL

**Pasos**

1. Consultar resultados con cada regla.

**Resultado esperado**

- TOTAL_KM elige al de más km sin sorteo; si los km también empatan en el corte, sortea entre esos.
- DRAW sortea maxWinners entre los empatados.
- SHARE_ALL declara ganadores a todos los empatados y divide el premio.
- Sin empatados no hay ganador; un líder único gana sin desempate.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `scoring.spec.ts` | sin empatados no hay ganador |
| ✅ | Unitaria | `scoring.spec.ts` | un solo participante en el tope gana sin desempate |
| ✅ | Unitaria | `scoring.spec.ts` | maxWinners = 1 devuelve un único ganador |
| ✅ | Unitaria | `scoring.spec.ts` | TOTAL_KM desempata por kilómetros sin sorteo |
| ✅ | Unitaria | `scoring.spec.ts` | TOTAL_KM con kilómetros también empatados en el corte: sortea entre esos |
| ✅ | Unitaria | `scoring.spec.ts` | TOTAL_KM combina cupos ya asegurados con sorteo en el corte |
| ✅ | Unitaria | `scoring.spec.ts` | SHARE_ALL: ganan todos los empatados aunque superen el cupo |
| ✅ | Unitaria | `results.service.spec.ts` | maxWinners = 1 con desempate por kilómetros elige al de más km |
| ✅ | Unitaria | `results.service.spec.ts` | SHARE_ALL reparte entre todos los empatados aunque superen el cupo |
| ✅ | API e2e | `challenge-scoring.e2e-spec.ts` | desempata por kilómetros y entrega el pote completo al único ganador |
| ✅ | API e2e | `challenge-scoring.e2e-spec.ts` | SHARE_ALL reparte el premio entre todos los empatados |

<a id="tc-score-04"></a>

### TC-SCORE-04 · Validación de la configuración de puntaje

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Reglas de puntaje | Media | Negativo | 2.1 | ✅ Aprobado |

**Precondiciones**

- Sesión de administrador.

**Datos de prueba:** maxWinners 0; luego 10/día, 1/km, mínimo 5, 1 ganador, TOTAL_KM

**Pasos**

1. Crear el reto inválido.
2. Crear el reto válido.

**Resultado esperado**

- 400 para maxWinners 0.
- 201 y los cinco valores quedan persistidos.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `challenge-scoring.e2e-spec.ts` | rechaza una configuración inválida (maxWinners = 0) |
| ✅ | Sesiones | `parallel-session-test.mjs` | maxWinners = 0 se rechaza (400) |
| ✅ | Sesiones | `parallel-session-test.mjs` | Reto con reglas de puntaje propias creado/actualizado |
| ✅ | Sesiones | `parallel-session-test.mjs` | Reglas de puntaje persistidas |

<a id="tc-score-05"></a>

### TC-SCORE-05 · Ranking web con reglas propias

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Reglas de puntaje | Media | UI | 6.1 | ✅ Aprobado |

**Precondiciones**

- Un reto con reglas propias y otro con los defaults.

**Datos de prueba:** Ranking de cada reto

**Pasos**

1. Abrir el ranking de cada reto.

**Resultado esperado**

- Con reglas propias: describe la regla, agrega la columna Puntos y marca "no califica".
- Con los defaults: sin columna de puntos.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | UI | `05-challenges-scoring.spec.ts` | el ranking describe la regla, muestra puntos y marca a quien no califica |
| ✅ | UI | `05-challenges-scoring.spec.ts` | un reto con las reglas por defecto no muestra la columna de puntos |
| ✅ | Guía | `capture.spec.ts` | ranking con puntos, no califica y premio proyectado |

<a id="tc-score-06"></a>

### TC-SCORE-06 · Notas de la regla y compatibilidad

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Reglas de puntaje | Media | Funcional | 6.1 | ✅ Aprobado |

**Precondiciones**

- Reto con reglas propias y reto del seed con defaults.

**Datos de prueba:** results.notes

**Pasos**

1. Consultar los resultados de ambos.

**Resultado esperado**

- Con reglas propias las notas describen puntaje y mínimo ("Mínimo para calificar").
- Con defaults no se agrega descripción y el comportamiento histórico se mantiene.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `scoring.spec.ts` | no describe nada con la configuración por defecto |
| ✅ | Unitaria | `scoring.spec.ts` | describe puntaje y mínimo cuando están configurados |
| ✅ | API e2e | `challenge-scoring.e2e-spec.ts` | un reto sin reglas propias mantiene el comportamiento histórico |
| ✅ | Sesiones | `parallel-session-test.mjs` | Sus resultados describen la regla activa |
| ✅ | Sesiones | `parallel-session-test.mjs` | El reto seed conserva las reglas por defecto |

<a id="tc-score-07"></a>

### TC-SCORE-07 · El tope se muestra en la unidad del reto

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Reglas de puntaje | Media | Regresión | 6.1 | ✅ Aprobado |

> Relacionado con DEF-03 (ver reporte de validación).

**Precondiciones**

- Reto con reglas de puntaje propias.

**Datos de prueba:** Ana con 96 puntos

**Pasos**

1. Abrir Ranking y Mi reto.

**Resultado esperado**

- Ranking: "top actual: 96 puntos" (no "96 días").
- Mi reto: tarjeta Top del reto "96 pts".

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | UI | `05-challenges-scoring.spec.ts` | el ranking describe la regla, muestra puntos y marca a quien no califica |
| ✅ | Guía | `capture.spec.ts` | ranking con puntos, no califica y premio proyectado |
| ✅ | Guía | `capture.spec.ts` | panel Mi reto muestra período, cuenta regresiva y métricas |

<a id="fin"></a>

## Finanzas

| ID | Caso | Prioridad | Tipo | Estado |
|---|---|---|---|---|
| [TC-FIN-01](#tc-fin-01) | Estados de pago | Alta | Funcional | ✅ Aprobado |
| [TC-FIN-02](#tc-fin-02) | Resumen financiero | Alta | Funcional | ✅ Aprobado |
| [TC-FIN-03](#tc-fin-03) | Finanzas solo para el admin | Alta | Seguridad | ✅ Aprobado |
| [TC-FIN-04](#tc-fin-04) | El premio se reparte con lo recaudado | Alta | Funcional | ✅ Aprobado |
| [TC-FIN-05](#tc-fin-05) | Finanzas en la web | Media | UI | ✅ Aprobado |
| [TC-FIN-06](#tc-fin-06) | Presupuesto automático o fijado a mano | Alta | Funcional | ✅ Aprobado |
| [TC-FIN-07](#tc-fin-07) | Los pagos se cierran con el reto | Alta | Seguridad | ✅ Aprobado |
| [TC-FIN-08](#tc-fin-08) | Comprobante por revisar: regla derivada y resumen financiero | Alta | Funcional | ✅ Aprobado |
| [TC-FIN-09](#tc-fin-09) | Cola de comprobantes del admin en la web | Alta | UI | ✅ Aprobado |

<a id="tc-fin-01"></a>

### TC-FIN-01 · Estados de pago

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Finanzas | Alta | Funcional | 3.3 | ✅ Aprobado |

**Precondiciones**

- Reto con cuota 150 y un participante sin pagar.

**Datos de prueba:** Web: Marcar pagado con monto 60; luego con el monto por defecto; luego 0. Unitarias: pagos 120, 60 y ninguno; reto gratuito

**Pasos**

1. Pulsar Marcar pagado, poner 60 y Guardar pago.
2. Marcar impago y volver a pagar con el monto que viene.
3. Marcar impago, poner 0 y Guardar pago.

**Resultado esperado**

- 60 de 150: Parcial 60, debe 90, y el resumen suma 60.
- Con el monto por defecto (la cuota): Pagado 150.
- Monto 0: no se guarda y explica que debe ser mayor que cero.
- paid (completo), partial (menos que la cuota) y unpaid; con cuota 0 todos quedan pagados; impago limpia monto y fecha.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | UI | `10-api-only-actions.spec.ts` | registra un pago parcial, el pago completo por defecto y rechaza un monto cero |
| ✅ | Guía | `capture.spec.ts` | registrar un pago parcial |
| ✅ | Unitaria | `finance.service.spec.ts` | pagado completo, parcial e impago |
| ✅ | Unitaria | `finance.service.spec.ts` | con cuota 0 todos están pagados |
| ✅ | API e2e | `challenge-finance.e2e-spec.ts` | marcar impago limpia monto y fecha y actualiza el resumen |

<a id="tc-fin-02"></a>

### TC-FIN-02 · Resumen financiero

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Finanzas | Alta | Funcional | 3.4 | ✅ Aprobado |

**Precondiciones**

- Cuota 120, presupuesto 600, 5 inscritos: 3 pagaron 120, 1 pagó 60, 1 nada.

**Datos de prueba:** GET /api/challenges/:id/finance

**Pasos**

1. Consultar como admin.

**Resultado esperado**

- expectedTotal 600, collectedTotal 420, pendingTotal 180.
- budgetTotal (efectivo) 600 con su budgetMode; budgetCovered false y budgetDelta -180.
- counts { paid 3, partial 1, unpaid 1 } y el state de cada participante.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `finance.service.spec.ts` | pagos mixtos: 3 completos, 1 parcial, 1 impago |
| ✅ | Unitaria | `finance.service.spec.ts` | presupuesto cubierto con excedente |
| ✅ | Unitaria | `finance.service.spec.ts` | reto gratuito: todos pagados y nada pendiente |
| ✅ | Unitaria | `finance.service.spec.ts` | fila histórica marcada pagada sin monto -> parcial con 0 |
| ✅ | Unitaria | `finance.service.spec.ts` | calcula a partir del reto y sus participantes |
| ✅ | API e2e | `challenge-finance.e2e-spec.ts` | GET /challenges/:id/finance: esperado 600, recaudado 420, pendiente 180, presupuesto no cubierto |
| ✅ | Sesiones | `parallel-session-test.mjs` | Admin obtiene el resumen financiero |
| ✅ | Sesiones | `parallel-session-test.mjs` | Esperado = cuota x inscritos |
| ✅ | Sesiones | `parallel-session-test.mjs` | Pendiente = max(0, esperado - recaudado) |
| ✅ | Sesiones | `parallel-session-test.mjs` | Cobertura del presupuesto coherente |
| ✅ | Sesiones | `parallel-session-test.mjs` | Estado de pago válido por participante |

<a id="tc-fin-03"></a>

### TC-FIN-03 · Finanzas solo para el admin

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Finanzas | Alta | Seguridad | 3.4 | ✅ Aprobado |

**Precondiciones**

- Reto existente.

**Datos de prueba:** GET finance como participante; como admin con id inexistente

**Pasos**

1. Consultar en ambos escenarios.

**Resultado esperado**

- 403 para el participante.
- 404 para un reto inexistente.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `finance.service.spec.ts` | 404 si el reto no existe |
| ✅ | API e2e | `challenge-finance.e2e-spec.ts` | el resumen financiero es solo para admin (403) y 404 si el reto no existe |
| ✅ | Sesiones | `parallel-session-test.mjs` | Ana NO puede ver finanzas (403) |

<a id="tc-fin-04"></a>

### TC-FIN-04 · El premio se reparte con lo recaudado

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Finanzas | Alta | Funcional | 6.1 | ✅ Aprobado |

**Precondiciones**

- Retos con cuota y pagos registrados; un reto sin cuota.

**Datos de prueba:** Recaudado 600 con 1 ganador, 2 empatados y 3 premiados; reto con cuota sin pagos; reto sin cuota; mismo recaudado con presupuesto automático y con 900 fijado

**Pasos**

1. Consultar results.payout en cada escenario.

**Resultado esperado**

- El pote es lo recaudado (pagos confirmados), no el presupuesto: perWinner 600, 300 y 200.
- Un reto con cuota y sin pagos: pote 0, monetary true. Un reto sin cuota: monetary false y perWinner 0.
- Mismo recaudado y distinto presupuesto: mismo pote.
- Quien no pagó puede ganar y cobra como cualquier ganador.
- El reparto nunca supera el pote (redondeo hacia abajo); sin ganadores perWinner 0.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `finance.service.spec.ts` | un ganador se lleva el pote |
| ✅ | Unitaria | `finance.service.spec.ts` | dos ganadores reparten |
| ✅ | Unitaria | `finance.service.spec.ts` | tres premiados |
| ✅ | Unitaria | `finance.service.spec.ts` | reto sin cuota -> premio no monetario |
| ✅ | Unitaria | `finance.service.spec.ts` | reto con cuota y sin pagos todavía -> pote 0 pero monetario |
| ✅ | Unitaria | `finance.service.spec.ts` | sin ganadores -> perWinner 0 |
| ✅ | Unitaria | `finance.service.spec.ts` | el reparto nunca supera el pote (redondeo hacia abajo) |
| ✅ | Unitaria | `finance.service.spec.ts` | lo recaudado suma solo los pagos confirmados |
| ✅ | Unitaria | `results.service.spec.ts` | reto sin cuota -> premio no monetario |
| ✅ | Unitaria | `results.service.spec.ts` | el pote es lo recaudado y no depende del presupuesto |
| ✅ | Unitaria | `results.service.spec.ts` | quien no pagó puede ganar y cobra como cualquier ganador |
| ✅ | API e2e | `challenge-finance.e2e-spec.ts` | results incluye payout: el pote es lo recaudado para un ganador |
| ✅ | API e2e | `challenge-finance.e2e-spec.ts` | un reto sin cuota reporta premio no monetario |
| ✅ | Sesiones | `parallel-session-test.mjs` | Results incluye payout con pote = recaudado |

<a id="tc-fin-05"></a>

### TC-FIN-05 · Finanzas en la web

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Finanzas | Media | UI | 3.4 | ✅ Aprobado |

**Precondiciones**

- Reto de demostración: 5 inscritos, cuota 150; Ana y Bruno pagaron, Carla 75.

**Datos de prueba:** Participantes (admin) y Ranking (participante)

**Pasos**

1. Abrir Participantes y marcar/desmarcar un pago.
2. Abrir Ranking como participante.

**Resultado esperado**

- Tarjetas Esperado 750, Recaudado 375, Pendiente y Presupuesto (con "automático" o "ajustado"), actualizadas al instante.
- Chip Parcial con el monto.
- Ranking: sin pagos dice "aún no hay pagos registrados"; con pagos, el pote recaudado marcado como proyectado.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | UI | `04-finance.spec.ts` | el resumen financiero refleja los pagos al instante |
| ✅ | UI | `04-finance.spec.ts` | el ranking muestra el premio por ganador |
| ✅ | Guía | `capture.spec.ts` | participantes con resumen financiero |

<a id="tc-fin-06"></a>

### TC-FIN-06 · Presupuesto automático o fijado a mano

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Finanzas | Alta | Funcional | 2.1 | ✅ Aprobado |

**Precondiciones**

- Reto con cuota 100 y 2 inscritos.
- Web: reto de finanzas de prueba con cuota 120 y 1 inscrito.

**Datos de prueba:** budgetTotal null, 800 y otra vez null; inscribir y quitar; cambiar la cuota a 150

**Pasos**

1. Crear un reto sin presupuesto.
2. Inscribir a alguien y cambiar la cuota.
3. Fijar 800 a mano y volver a cambiar inscritos y cuota.
4. Volver a automático (web: marcar la casilla; API: budgetTotal null).

**Resultado esperado**

- Sin monto, el presupuesto es automático: cuota × inscritos (2 × 100 = 200), y se recalcula al inscribir (300) o cambiar la cuota (450).
- Un monto fijado (800) queda "ajustado" y no cambia solo.
- Al volver a automático vale otra vez cuota × inscritos; la tarjeta de finanzas dice "automático".
- El reto de mayo del seed queda automático después de la migración.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `finance.service.spec.ts` | sin monto fijado es cuota × inscritos |
| ✅ | Unitaria | `finance.service.spec.ts` | el automático sigue a los inscritos y a la cuota |
| ✅ | Unitaria | `finance.service.spec.ts` | un monto fijado a mano no cambia con los inscritos ni con la cuota |
| ✅ | Unitaria | `challenges.service.spec.ts` | crear un reto sin presupuesto lo deja automático (NULL) |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | FIN: el presupuesto automático sigue a los inscritos y a la cuota; uno manual se mantiene |
| ✅ | UI | `04-finance.spec.ts` | el presupuesto es automático y se puede fijar a mano y volver a automático |
| ✅ | Sesiones | `parallel-session-test.mjs` | Presupuesto del seed automático |

<a id="tc-fin-07"></a>

### TC-FIN-07 · Los pagos se cierran con el reto

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Finanzas | Alta | Seguridad | 6.3 | ✅ Aprobado |

**Precondiciones**

- Un reto cerrado con pagos registrados.

**Datos de prueba:** Marcar impago a Bruno; marcar pagada a Ana con 100; subir un comprobante como Ana

**Pasos**

1. Intentar cambiar pagos del reto cerrado.
2. Intentar subir un comprobante.
3. Consultar el pote.

**Resultado esperado**

- Las tres acciones responden 400 "No se puede modificar un reto cerrado".
- Lo recaudado y el pote del premio no cambian. Un pago tardío se registra en el reto siguiente.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `challenges.service.spec.ts` | un reto cerrado no admite registrar ni borrar pagos |
| ✅ | Unitaria | `challenges.service.spec.ts` | un reto cerrado no admite subir comprobantes de pago |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | FIN: un reto cerrado no admite pagos ni comprobantes y su pote no cambia |

<a id="tc-fin-08"></a>

### TC-FIN-08 · Comprobante por revisar: regla derivada y resumen financiero

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Finanzas | Alta | Funcional | 3.3 | ✅ Aprobado |

**Precondiciones**

- Reto con cuota 120 y participantes con comprobante subido.

**Datos de prueba:** Comprobante sin pago; pago de 120; pago de 60 y un comprobante nuevo; pago de 60 con comprobante anterior; comprobante tras un pago completo; pago desmarcado con comprobante; reto gratuito; fechas iguales

**Pasos**

1. Subir el comprobante y consultar GET /api/challenges/:id/finance como admin.
2. Registrar 120, desmarcar, registrar 60 y subir otro comprobante, consultando cada vez.
3. Consultar como participante.

**Resultado esperado**

- Comprobante sin pago registrado: proofToReview true y proofsToReview suma 1; lo recaudado y lo pendiente no cambian.
- Registrar el pago completo lo saca de la cola; desmarcarlo con el comprobante guardado lo devuelve.
- Con 60 registrados un comprobante más nuevo vuelve a la cola (el estado sigue siendo partial); uno más viejo o de la misma fecha no.
- Un comprobante tras un pago completo, un reto gratuito o la ausencia de comprobante nunca entran en la cola.
- Cada fila trae proofToReview y proofUploadedAt; el participante recibe 403.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `finance.service.spec.ts` | comprobante sin pago registrado: por revisar |
| ✅ | Unitaria | `finance.service.spec.ts` | registrar el pago completo lo saca de la cola |
| ✅ | Unitaria | `finance.service.spec.ts` | pago parcial con comprobante más nuevo: vuelve a la cola |
| ✅ | Unitaria | `finance.service.spec.ts` | pago parcial con comprobante más viejo: no está por revisar |
| ✅ | Unitaria | `finance.service.spec.ts` | fechas iguales cuentan como cubierto |
| ✅ | Unitaria | `finance.service.spec.ts` | comprobante posterior a un pago completo: no entra |
| ✅ | Unitaria | `finance.service.spec.ts` | desmarcar el pago con comprobante guardado lo devuelve a la cola |
| ✅ | Unitaria | `finance.service.spec.ts` | reto gratuito: nunca |
| ✅ | Unitaria | `finance.service.spec.ts` | sin comprobante: nunca |
| ✅ | Unitaria | `finance.service.spec.ts` | cola de comprobantes: cuenta, marcas por fila y totales sin cambio (D4) |
| ✅ | API e2e | `challenge-finance.e2e-spec.ts` | cola de comprobantes: un comprobante entra, registrar el pago lo saca y nunca suma al recaudado |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | PAY: me.paymentStatus recorre pending, in_review, partial y paid, y nadie ve el de otro |

<a id="tc-fin-09"></a>

### TC-FIN-09 · Cola de comprobantes del admin en la web

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Finanzas | Alta | UI | 3.3 | ✅ Aprobado |

**Precondiciones**

- Reto con cuota 120 y Ana con un comprobante subido sin pago registrado.

**Datos de prueba:** Participantes (admin): tarjeta Por revisar, filtros con contadores, pago completo y pago parcial

**Pasos**

1. Abrir Participantes.
2. Pulsar la tarjeta Por revisar.
3. Registrar el pago completo de Ana.
4. Repetir con un pago parcial de 60.

**Resultado esperado**

- La tarjeta "Por revisar" dice 1 (resaltada) y los filtros Todos, Por revisar, Sin pagar, Parciales y Pagados traen su contador.
- Al pulsar la tarjeta solo se listan los de la cola, el comprobante más antiguo primero, con "Comprobante por revisar · subido el <fecha>" y "Ver comprobante de pago".
- Tras registrar el pago completo la tarjeta dice 0 y Ana aparece en Pagados.
- Con un pago parcial de 60 sale de la cola y aparece en Parciales, debiendo 60.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | UI | `04-finance.spec.ts` | la cola de comprobantes: por revisar, filtro, pago completo y pago parcial |
| ✅ | Web (unitaria) | `payment.test.ts` | filterCounts usa los conteos del resumen |
| ✅ | Web (unitaria) | `payment.test.ts` | Por revisar lista solo la cola, el comprobante más antiguo primero |
| ✅ | Web (unitaria) | `payment.test.ts` | los filtros por estado y Todos |
| ✅ | Web (unitaria) | `payment.test.ts` | sin resumen todavía se muestran todos |
| ✅ | Web (unitaria) | `payment.test.ts` | amountOwed y la fecha de subida |
| ✅ | Guía | `capture.spec.ts` | cola de comprobantes por revisar |

<a id="up"></a>

## Carga de archivos

| ID | Caso | Prioridad | Tipo | Estado |
|---|---|---|---|---|
| [TC-UP-01](#tc-up-01) | Firma de subida ligada al reto, al participante y al propósito | Alta | Seguridad | ✅ Aprobado |
| [TC-UP-02](#tc-up-02) | Simulador local de subidas en desarrollo | Media | Funcional | ✅ Aprobado |
| [TC-UP-03](#tc-up-03) | Sin simulador local en producción | Alta | Seguridad | ✅ Aprobado |
| [TC-UP-04](#tc-up-04) | Formatos permitidos por propósito | Alta | Seguridad | ✅ Aprobado |
| [TC-UP-05](#tc-up-05) | Solo se acepta evidencia propia (fotos y comprobantes) | Alta | Seguridad | ✅ Aprobado |
| [TC-UP-06](#tc-up-06) | Límite de firmas de subida por minuto | Media | Seguridad | ✅ Aprobado |
| [TC-UP-07](#tc-up-07) | Retirar una actividad libera sus fotos | Alta | Funcional | ✅ Aprobado |
| [TC-UP-08](#tc-up-08) | El comprobante reemplazado se conserva salvo configuración | Alta | Funcional | ✅ Aprobado |
| [TC-UP-09](#tc-up-09) | Reporte de archivos huérfanos | Media | Funcional | ✅ Aprobado |

<a id="tc-up-01"></a>

### TC-UP-01 · Firma de subida ligada al reto, al participante y al propósito

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Carga de archivos | Alta | Seguridad | 4.3 | ✅ Aprobado |

**Precondiciones**

- Ana inscrita en un reto activo; un usuario no inscrito; el admin sin inscribir.

**Datos de prueba:** POST /api/upload/sign { challengeId, purpose }

**Pasos**

1. Firmar sin sesión.
2. Firmar como Ana para activity y payment-proof.
3. Enviar folder, resourceType, un propósito inválido o un id que no es UUID.
4. Firmar como no inscrito, como admin y para un reto inexistente.

**Resultado esperado**

- Sin sesión: 401.
- Ana recibe 201 con la carpeta <base>/<reto>/<Ana>/<propósito>, los formatos firmados y maxBytes; en desarrollo { local: true, uploadUrl: .../api/upload/local }.
- Campos de más o valores inválidos: 400.
- No inscrito y admin: 403 "No participas en este reto"; reto inexistente: 404.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `upload.service.spec.ts` | firma allowed_formats, folder y timestamp, y sube siempre como image |
| ✅ | Unitaria | `upload.service.spec.ts` | el comprobante acepta PDF y respeta UPLOAD_MAX_BYTES |
| ✅ | Unitaria | `upload-policy.spec.ts` | la carpeta incluye el reto, el usuario y el propósito |
| ✅ | Unitaria | `upload-policy.spec.ts` | normalizeBase quita barras y rechaza caracteres que romperían las carpetas |
| ✅ | Unitaria | `challenges.service.spec.ts` | assertActiveParticipant: inactivo 400 y no inscrito 403 |
| ✅ | Unitaria | `challenges.service.spec.ts` | assertPaymentParticipant: cerrado 400, no inscrito 403, borrador permitido |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | UP: firmar una subida exige sesión (401) y con sesión devuelve la firma |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | UP: la firma va al reto, al usuario y al propósito, con formatos firmados |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | UP: la carpeta y el tipo de recurso no los elige el cliente (400) |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | UP: solo firma un participante del reto (403), también para el admin |

<a id="tc-up-02"></a>

### TC-UP-02 · Simulador local de subidas en desarrollo

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Carga de archivos | Media | Funcional | 0.1 | ✅ Aprobado |

**Precondiciones**

- Sin Cloudinary, NODE_ENV distinto de production.

**Datos de prueba:** POST /api/upload/local (multipart file y folder)

**Pasos**

1. Subir sin sesión.
2. Subir a la carpeta propia un .jpeg, un .gif y un PDF de actividad.
3. Subir a la carpeta de otro usuario y a una carpeta vieja (2094-01).
4. Usar lo subido como foto de una actividad.

**Resultado esperado**

- Sin sesión: 401.
- El .jpeg se guarda como .jpg dentro de la carpeta propia; el .gif y el PDF de actividad responden 400 "Formato no permitido…".
- Carpeta ajena: 403; carpeta no derivada: 400 "Carpeta de subida no válida".
- Lo subido sirve como evidencia propia.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `upload.service.spec.ts` | sin Cloudinary en desarrollo activa el simulador local |
| ✅ | Unitaria | `upload.service.spec.ts` | el simulador solo acepta carpetas derivadas del propio usuario |
| ✅ | Unitaria | `upload.service.spec.ts` | rechaza un formato no permitido para el propósito |
| ✅ | Unitaria | `upload.service.spec.ts` | guarda los JPEG como jpg, igual que Cloudinary |
| ✅ | Unitaria | `upload.service.spec.ts` | el comprobante admite PDF |
| ✅ | Unitaria | `upload-policy.spec.ts` | parseFolder reconoce solo carpetas derivadas |
| ✅ | Unitaria | `upload-policy.spec.ts` | la carpeta derivada no cambia con el saneado del simulador |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | UP: el simulador local de subidas exige sesión (401) |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | UP: el simulador local guarda en la carpeta propia y aplica formatos y dueño |

<a id="tc-up-03"></a>

### TC-UP-03 · Sin simulador local en producción

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Carga de archivos | Alta | Seguridad | 8.4 | ✅ Aprobado |

**Precondiciones**

- NODE_ENV=production o Cloudinary configurado.

**Datos de prueba:** Configuración de UploadService

**Pasos**

1. Resolver el modo de subida.

**Resultado esperado**

- En producción sin Cloudinary no se activa el simulador (subidas deshabilitadas).
- Con Cloudinary nunca se usa el modo local.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `upload.service.spec.ts` | sin Cloudinary en producción NO activa el simulador local |
| ✅ | Unitaria | `upload.service.spec.ts` | con Cloudinary configurado nunca usa el modo local |

<a id="tc-up-04"></a>

### TC-UP-04 · Formatos permitidos por propósito

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Carga de archivos | Alta | Seguridad | 4.3 | ✅ Aprobado |

**Precondiciones**

- Ana inscrita en un reto activo.

**Datos de prueba:** Actividad: heic, jpg, png, webp. Comprobante: además pdf

**Pasos**

1. Subir un PDF como foto de actividad desde el formulario.
2. Subir un PDF como comprobante desde el inicio.
3. Revisar los mensajes de error de formato y tamaño.

**Resultado esperado**

- El PDF de actividad muestra "Formato no permitido. Usa JPG, PNG, WEBP o HEIC (PDF solo para comprobantes)" y no se registra nada.
- El comprobante en PDF se sube y queda el enlace "Ver comprobante cargado".
- Un archivo mayor que maxBytes muestra "El archivo supera el tamaño máximo (10 MB)" sin subirse.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `upload-policy.spec.ts` | formatos exactos por propósito, en orden alfabético |
| ✅ | Unitaria | `upload-policy.spec.ts` | un comprobante acepta PDF |
| ✅ | Unitaria | `upload-policy.spec.ts` | rechaza un PDF en una actividad |
| ✅ | Unitaria | `upload-policy.spec.ts` | rechaza la extensión jpeg |
| ✅ | Web (unitaria) | `upload-errors.test.ts` | el tamaño máximo se muestra en MB |
| ✅ | Web (unitaria) | `upload-errors.test.ts` | traduce los rechazos de formato de Cloudinary y del simulador |
| ✅ | Web (unitaria) | `upload-errors.test.ts` | traduce los archivos demasiado grandes |
| ✅ | Web (unitaria) | `upload-errors.test.ts` | muestra el mensaje en español del simulador y un texto genérico si no hay mensaje |
| ✅ | UI | `02-activity-upload.spec.ts` | una foto de actividad en PDF muestra el aviso de formato y no se registra |
| ✅ | UI | `02-activity-upload.spec.ts` | el comprobante de pago se puede subir en PDF desde el inicio |

<a id="tc-up-05"></a>

### TC-UP-05 · Solo se acepta evidencia propia (fotos y comprobantes)

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Carga de archivos | Alta | Seguridad | 4.3 | ✅ Aprobado |

**Precondiciones**

- Ana y Bruno inscritos en el mismo reto activo.

**Datos de prueba:** Foto de example.com; foto y comprobante de Bruno; campos de comprobante en el pago del admin

**Pasos**

1. Ana registra una actividad con una foto externa y con una foto de Bruno.
2. Ana envía como suyo el comprobante de Bruno; un no inscrito sube un comprobante.
3. El admin marca un pago enviando campos de comprobante.

**Resultado esperado**

- Foto externa: 400 "La foto debe subirse desde la plataforma"; foto ajena: 400; no se crea la actividad.
- Comprobante ajeno: 400 "El comprobante debe subirse desde la plataforma"; no inscrito: 403.
- El admin recibe 400 y el registro no cambia; marcar o desmarcar un pago no toca el comprobante.
- La captura de FC de la propia carpeta se acepta; la importación del admin no pasa por esta regla.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `upload-policy.spec.ts` | acepta el archivo propio con y sin versión |
| ✅ | Unitaria | `upload-policy.spec.ts` | rechaza otro host |
| ✅ | Unitaria | `upload-policy.spec.ts` | rechaza un host que solo empieza igual |
| ✅ | Unitaria | `upload-policy.spec.ts` | rechaza otra cuenta |
| ✅ | Unitaria | `upload-policy.spec.ts` | rechaza http |
| ✅ | Unitaria | `upload-policy.spec.ts` | rechaza la URL de otro archivo |
| ✅ | Unitaria | `upload-policy.spec.ts` | rechaza una query |
| ✅ | Unitaria | `upload-policy.spec.ts` | rechaza el id de otro reto |
| ✅ | Unitaria | `upload-policy.spec.ts` | rechaza el id de otro usuario |
| ✅ | Unitaria | `upload-policy.spec.ts` | rechaza el id de otro propósito |
| ✅ | Unitaria | `upload-policy.spec.ts` | rechaza el id de un id con .. |
| ✅ | Unitaria | `upload-policy.spec.ts` | rechaza el id de la carpeta sin archivo |
| ✅ | Unitaria | `upload-policy.spec.ts` | acepta la URL local del archivo propio |
| ✅ | Unitaria | `upload-policy.spec.ts` | respeta un PUBLIC_URL con path |
| ✅ | Unitaria | `upload-policy.spec.ts` | rechaza otro origen |
| ✅ | Unitaria | `activities.service.spec.ts` | acepta la foto de actividad y la captura de FC de la propia carpeta |
| ✅ | Unitaria | `activities.service.spec.ts` | rechaza una foto subida fuera de la plataforma |
| ✅ | Unitaria | `activities.service.spec.ts` | rechaza la foto de otro participante del mismo reto |
| ✅ | Unitaria | `activities.service.spec.ts` | rechaza un comprobante usado como foto de actividad |
| ✅ | Unitaria | `activities.service.spec.ts` | rechaza la misma foto adjunta dos veces |
| ✅ | Unitaria | `challenges.service.spec.ts` | un no inscrito no puede subir comprobante (403) |
| ✅ | Unitaria | `challenges.service.spec.ts` | rechaza el comprobante de otro participante o externo |
| ✅ | Unitaria | `challenges.service.spec.ts` | guarda el comprobante propio, también en PDF |
| ✅ | Unitaria | `challenges.service.spec.ts` | marcar o desmarcar un pago no toca el comprobante guardado |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | UP: una actividad con foto externa o ajena se rechaza (400) y no se crea |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | UP: el comprobante ajeno se rechaza (400) y el admin no puede adjuntar comprobantes (400) |

<a id="tc-up-06"></a>

### TC-UP-06 · Límite de firmas de subida por minuto

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Carga de archivos | Media | Seguridad | 8.4 | ✅ Aprobado |

**Precondiciones**

- UPLOAD_SIGN_LIMIT=3 (por defecto 30).

**Datos de prueba:** POST /api/upload/sign repetido desde el mismo cliente

**Pasos**

1. Pedir 4 firmas en menos de un minuto.

**Resultado esperado**

- Las 3 primeras pasan el limitador (sin sesión responden 401); la cuarta responde 429.
- El límite se lee en cada petición, así que también se puede definir en backend/.env.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `http.spec.ts` | usa 30 firmas por minuto por defecto y descarta valores inválidos |
| ✅ | Unitaria | `upload.controller.spec.ts` | firma con límite configurable: 30 por minuto por defecto y UPLOAD_SIGN_LIMIT si está definido |
| ✅ | API e2e | `ops-throttle.e2e-spec.ts` | UP: las firmas de subida tienen su propio límite por minuto (UPLOAD_SIGN_LIMIT) |

<a id="tc-up-07"></a>

### TC-UP-07 · Retirar una actividad libera sus fotos

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Carga de archivos | Alta | Funcional | 8.4 | ✅ Aprobado |

**Precondiciones**

- Participante inscrito en un reto activo con una actividad PENDIENTE y dos fotos subidas.

**Datos de prueba:** DELETE /api/activities/:id

**Pasos**

1. Retirar la actividad.
2. Revisar el almacenamiento (Cloudinary o backend/uploads).
3. Repetir con una foto que otra actividad también usa y con una foto importada (import/...).

**Resultado esperado**

- Responde 204 y las fotos se borran después de guardar el cambio, sin esperar al almacenamiento.
- Si el almacenamiento falla, la respuesta no cambia y queda un aviso en los Logs solo con el id del archivo.
- Una foto que otra actividad usa se conserva hasta que se borra la última; las fotos importadas nunca se borran.
- Si el borrado de la actividad se rechaza (reto cerrado, 403), no se libera nada.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `upload.service.spec.ts` | ok es borrado, not found es no existía, otro resultado lanza y los errores de red se propagan |
| ✅ | Unitaria | `upload.service.spec.ts` | borra el archivo del id con su extensión |
| ✅ | Unitaria | `upload.service.spec.ts` | sin archivo o sin carpeta responde no existía |
| ✅ | Unitaria | `upload.service.spec.ts` | nunca sale de la carpeta de subidas |
| ✅ | Unitaria | `upload.service.spec.ts` | nunca lanza: un fallo de almacenamiento queda como aviso con el id |
| ✅ | Unitaria | `upload.service.spec.ts` | no existía no es un aviso |
| ✅ | Unitaria | `upload.service.spec.ts` | conserva un archivo que otra foto o un comprobante siguen usando |
| ✅ | Unitaria | `upload.service.spec.ts` | ignora las fotos importadas y los ids repetidos |
| ✅ | Unitaria | `activities.service.spec.ts` | después de borrar pide liberar las fotos de la actividad |
| ✅ | Unitaria | `activities.service.spec.ts` | si el borrado se rechaza no libera nada |
| ✅ | API e2e | `asset-cleanup.e2e-spec.ts` | CLEAN: retirar una actividad borra sus fotos del almacenamiento y responde 204 |
| ✅ | API e2e | `asset-cleanup.e2e-spec.ts` | CLEAN: un archivo que otra actividad sigue usando se conserva hasta que se borra la última |
| ✅ | API e2e | `asset-cleanup.e2e-spec.ts` | CLEAN: una foto importada (import/...) nunca se borra al retirar la actividad |

<a id="tc-up-08"></a>

### TC-UP-08 · El comprobante reemplazado se conserva salvo configuración

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Carga de archivos | Alta | Funcional | 8.4 | ✅ Aprobado |

**Precondiciones**

- Participante inscrito en un reto activo con un comprobante ya subido.

**Datos de prueba:** PATCH /api/challenges/:id/participants/me/payment-proof

**Pasos**

1. Subir un comprobante nuevo.
2. Repetir con UPLOAD_DELETE_REPLACED_PROOFS=true.
3. Volver a enviar el mismo comprobante.

**Resultado esperado**

- Por defecto el comprobante anterior se conserva (evidencia financiera).
- Con UPLOAD_DELETE_REPLACED_PROOFS=true el anterior se libera después de guardar el cambio.
- Enviar el mismo archivo otra vez no libera nada.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `challenges.service.spec.ts` | por defecto conserva el comprobante anterior |
| ✅ | Unitaria | `challenges.service.spec.ts` | con el borrado activado libera el anterior, y no si es el mismo archivo |
| ✅ | API e2e | `asset-cleanup.e2e-spec.ts` | CLEAN: por defecto el comprobante reemplazado se conserva |

<a id="tc-up-09"></a>

### TC-UP-09 · Reporte de archivos huérfanos

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Carga de archivos | Media | Funcional | 8.4 | ✅ Aprobado |

**Precondiciones**

- Variables de la API (DATABASE_URL y CLOUDINARY_*), o --local en desarrollo.

**Datos de prueba:** node scripts/cloudinary-orphans.mjs [--local] [--json]

**Pasos**

1. Generar el reporte con un archivo referenciado y uno huérfano.
2. Generarlo sin credenciales de Cloudinary y sin --local.

**Resultado esperado**

- Lista solo el huérfano, con categoría (activity, payment-proof o legacy), fecha y tamaño total; en Cloudinary, además el uso del plan.
- No borra nada.
- Sin credenciales sale con código 1 y sugiere --local.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `asset-cleanup.e2e-spec.ts` | CLEAN: en modo local lista el archivo huérfano y no el referenciado, sin borrar nada |
| ✅ | API e2e | `asset-cleanup.e2e-spec.ts` | CLEAN: sin credenciales de Cloudinary y sin --local sale con código 1 y un mensaje claro |

<a id="imp"></a>

## Importación masiva

| ID | Caso | Prioridad | Tipo | Estado |
|---|---|---|---|---|
| [TC-IMP-01](#tc-imp-01) | Plantilla de importación | Media | Funcional | ✅ Aprobado |
| [TC-IMP-02](#tc-imp-02) | Vista previa sin guardar | Alta | Funcional | ✅ Aprobado |
| [TC-IMP-03](#tc-imp-03) | Importar de forma idempotente | Alta | Funcional | ✅ Aprobado |
| [TC-IMP-04](#tc-imp-04) | Importación solo para el admin | Alta | Seguridad | ✅ Aprobado |
| [TC-IMP-05](#tc-imp-05) | Google Sheets sin configurar | Media | Funcional | ✅ Aprobado |
| [TC-IMP-06](#tc-imp-06) | Google Sheets: estado de la hoja | Media | Integración | ✅ Aprobado |
| [TC-IMP-07](#tc-imp-07) | Google Sheets: vista previa, hojas y cabeceras | Media | Integración | ✅ Aprobado |
| [TC-IMP-08](#tc-imp-08) | Google Sheets: fallo de lectura sin importación parcial | Alta | Negativo | ✅ Aprobado |
| [TC-IMP-12](#tc-imp-12) | La importación no escribe en un reto cerrado | Alta | Funcional | ✅ Aprobado |
| [TC-IMP-09](#tc-imp-09) | Acentos y eñes en archivos importados | Alta | Regresión | ✅ Aprobado |
| [TC-IMP-10](#tc-imp-10) | Fechas y decimales en archivos importados | Media | Funcional | ✅ Aprobado |
| [TC-IMP-11](#tc-imp-11) | Autenticación con cuenta de servicio de Google | Media | Integración | ✅ Aprobado |

<a id="tc-imp-01"></a>

### TC-IMP-01 · Plantilla de importación

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Importación masiva | Media | Funcional | 7.1 | ✅ Aprobado |

**Precondiciones**

- Sesión de administrador.

**Datos de prueba:** GET /api/import/template?format=csv|xlsx

**Pasos**

1. Descargar la plantilla en CSV y XLSX.
2. Volver a leerla.

**Resultado esperado**

- Trae las cabeceras esperadas, incluida heartRateMinutes.
- Ambos formatos se pueden volver a parsear.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `import.service.spec.ts` | la plantilla incluye la columna heartRateMinutes |
| ✅ | Unitaria | `import.service.spec.ts` | genera CSV reparseable con las cabeceras esperadas |
| ✅ | Unitaria | `import.service.spec.ts` | genera XLSX reparseable |
| ✅ | UI | `06-import.spec.ts` | la plantilla se descarga con la columna de minutos de FC |

<a id="tc-imp-02"></a>

### TC-IMP-02 · Vista previa sin guardar

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Importación masiva | Alta | Funcional | 7.2 | ✅ Aprobado |

**Precondiciones**

- Archivo con filas válidas, inválidas y con advertencia.

**Datos de prueba:** Email inválido, duración inválida, exerciseType NADAR

**Pasos**

1. Subir el archivo y pulsar Previsualizar.

**Resultado esperado**

- Filas válidas y con error, cada error con su motivo, y advertencias de FC.
- No escribe nada en la base.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `import.service.spec.ts` | acepta una fila válida |
| ✅ | Unitaria | `import.service.spec.ts` | rechaza email y duración inválidos |
| ✅ | Unitaria | `import.service.spec.ts` | rechaza exerciseType inválido |
| ✅ | UI | `06-import.spec.ts` | previsualiza con advertencias de FC e importa las filas válidas |
| ✅ | Guía | `capture.spec.ts` | importación: vista previa, resultado y Google Sheets |

<a id="tc-imp-03"></a>

### TC-IMP-03 · Importar de forma idempotente

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Importación masiva | Alta | Funcional | 7.3 | ✅ Aprobado |

**Precondiciones**

- Vista previa con filas válidas.

**Datos de prueba:** duplicateStrategy skip y update

**Pasos**

1. Importar.
2. Importar otra vez con skip.
3. Importar con update.

**Resultado esperado**

- Crea usuarios, inscripciones y actividades.
- La repetición omite; update actualiza.
- Muestra el resumen de creadas y omitidas.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | UI | `06-import.spec.ts` | previsualiza con advertencias de FC e importa las filas válidas |
| ✅ | API e2e | `import-sheet.e2e-spec.ts` | commit es idempotente: crea, luego omite, luego actualiza |
| ✅ | Guía | `capture.spec.ts` | importación: vista previa, resultado y Google Sheets |

<a id="tc-imp-04"></a>

### TC-IMP-04 · Importación solo para el admin

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Importación masiva | Alta | Seguridad | 7.1 | ✅ Aprobado |

**Precondiciones**

- Sesión de participante.

**Datos de prueba:** GET /api/import/template; endpoints de Google Sheets

**Pasos**

1. Llamar a los endpoints de importación.

**Resultado esperado**

- 403 en todos.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `app.e2e-spec.ts` | importación es solo para admin (403 a participante) |
| ✅ | API e2e | `import-sheet.e2e-spec.ts` | solo admin (403 para participante) |
| ✅ | Sesiones | `parallel-session-test.mjs` | Ana NO puede usar importación (403) |

<a id="tc-imp-05"></a>

### TC-IMP-05 · Google Sheets sin configurar

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Importación masiva | Media | Funcional | 7.4 | ✅ Aprobado |

**Precondiciones**

- Sin variables GOOGLE_*.

**Datos de prueba:** GET /api/import/sheet/status; POST preview y commit

**Pasos**

1. Consultar el estado.
2. Intentar preview y commit.
3. Abrir Importar en la web.

**Resultado esperado**

- status { configured: false }.
- preview y commit: 503; la importación por archivo sigue funcionando.
- La web explica qué variable falta (GOOGLE_SERVICE_ACCOUNT_EMAIL).

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `sheets.client.spec.ts` | isConfigured es false sin las variables |
| ✅ | Unitaria | `import.service.spec.ts` | sin configuración: status configured=false y preview 503 |
| ✅ | API e2e | `import-sheet.e2e-spec.ts` | sin configuración: status configured=false, preview y commit 503, archivo sigue funcionando |
| ✅ | UI | `06-import.spec.ts` | la sección de Google Sheets explica que falta configurarla |
| ✅ | Guía | `capture.spec.ts` | importación: vista previa, resultado y Google Sheets |

<a id="tc-imp-06"></a>

### TC-IMP-06 · Google Sheets: estado de la hoja

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Importación masiva | Media | Integración | 7.4 | ✅ Aprobado |

**Precondiciones**

- Integración configurada (cliente falso en pruebas).

**Datos de prueba:** Hoja compartida y hoja no compartida

**Pasos**

1. GET /api/import/sheet/status?spreadsheetId=... para cada hoja.

**Resultado esperado**

- Compartida: readable true con título, hojas, rango resuelto (primera hoja) y filas.
- No compartida: readable false con el motivo.
- El cliente llama a las URLs correctas con el rango codificado y el token.
- Los errores de Google se traducen a motivos legibles: 403 not_shared, 404 not_found, 400 invalid_range, 500 api_error.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `import.service.spec.ts` | status legible: título, hojas, rango resuelto (primera hoja) y filas de datos |
| ✅ | Unitaria | `import.service.spec.ts` | status no compartida: readable=false con motivo |
| ✅ | Unitaria | `sheets.client.spec.ts` | lee metadatos y valores con las URLs correctas (rango codificado) y el token |
| ✅ | Unitaria | `sheets.client.spec.ts` | mapea HTTP 403 a not_shared |
| ✅ | Unitaria | `sheets.client.spec.ts` | mapea HTTP 404 a not_found |
| ✅ | Unitaria | `sheets.client.spec.ts` | mapea HTTP 400 a invalid_range |
| ✅ | Unitaria | `sheets.client.spec.ts` | mapea HTTP 500 a api_error |
| ✅ | API e2e | `import-sheet.e2e-spec.ts` | status: hoja compartida legible (título, hojas, rango, filas) y hoja no compartida con motivo |

<a id="tc-imp-07"></a>

### TC-IMP-07 · Google Sheets: vista previa, hojas y cabeceras

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Importación masiva | Media | Integración | 7.4 | ✅ Aprobado |

**Precondiciones**

- Hoja con 1 fila conforme, 1 sin FC y 1 inválida.

**Datos de prueba:** preview; range=febrero; cabecera sin date

**Pasos**

1. Previsualizar.
2. Previsualizar otra hoja con range.
3. Previsualizar con cabecera incompleta.

**Resultado esperado**

- { total 3, valid 2, invalid 1, warnings 1 }, igual que con archivo.
- range lee solo esa hoja.
- Cabecera incompleta: 400 nombrando la columna.
- Acepta cabeceras con mayúsculas/espacios e ignora filas vacías.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `import.service.spec.ts` | mapea la cabecera y conserva las celdas como texto |
| ✅ | Unitaria | `import.service.spec.ts` | acepta cabeceras con mayúsculas y espacios |
| ✅ | Unitaria | `import.service.spec.ts` | ignora filas vacías (incluida una cabecera precedida de filas en blanco) |
| ✅ | Unitaria | `import.service.spec.ts` | rechaza cabeceras incompletas nombrando las columnas que faltan |
| ✅ | Unitaria | `import.service.spec.ts` | preview desde hoja refleja el mismo resumen que el archivo |
| ✅ | API e2e | `import-sheet.e2e-spec.ts` | preview refleja el resumen del archivo: 3 filas, 2 válidas, 1 inválida, 1 advertencia |
| ✅ | API e2e | `import-sheet.e2e-spec.ts` | cabecera incompleta -> 400 nombrando la columna |
| ✅ | API e2e | `import-sheet.e2e-spec.ts` | selección de hoja: range=febrero lee solo esa hoja |

<a id="tc-imp-08"></a>

### TC-IMP-08 · Google Sheets: fallo de lectura sin importación parcial

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Importación masiva | Alta | Negativo | 7.4 | ✅ Aprobado |

**Precondiciones**

- Hoja no compartida con la cuenta de servicio.

**Datos de prueba:** commit sobre esa hoja

**Pasos**

1. Importar.

**Resultado esperado**

- 400 con el motivo de acceso.
- No se crea ninguna actividad.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `import.service.spec.ts` | fallo de lectura en preview/commit -> 400 con el motivo |
| ✅ | API e2e | `import-sheet.e2e-spec.ts` | hoja no compartida en commit -> 400 sin importar nada |

<a id="tc-imp-12"></a>

### TC-IMP-12 · La importación no escribe en un reto cerrado

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Importación masiva | Alta | Funcional | 7.2 | ✅ Aprobado |

**Precondiciones**

- Un reto en COMPLETED.

**Datos de prueba:** CSV con una fila de ese reto para una persona sin cuenta

**Pasos**

1. Ver la vista previa.
2. Confirmar la importación.

**Resultado esperado**

- La vista previa marca la fila como inválida: "El reto M/AAAA está cerrado; no se pueden importar actividades".
- El commit la informa en errors sin crear cuenta, participación ni actividad, y sin sumarla a los contadores.
- Si el reto se cierra a mitad de una importación, las filas ya confirmadas quedan y las siguientes van a errors.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `import.service.spec.ts` | la vista previa marca como inválidas las filas de un reto cerrado |
| ✅ | Unitaria | `import.service.spec.ts` | el commit no crea cuentas, participaciones ni actividades en un reto cerrado |
| ✅ | Unitaria | `import.service.spec.ts` | si el reto se cierra a mitad del commit, las filas siguientes van a errors y no cuentan |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | FREEZE: la importación no escribe en un reto cerrado ni crea cuentas |

<a id="tc-imp-09"></a>

### TC-IMP-09 · Acentos y eñes en archivos importados

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Importación masiva | Alta | Regresión | 7.2 | ✅ Aprobado |

> Relacionado con DEF-01 (ver reporte de validación).

**Precondiciones**

- CSV guardado en UTF-8 (con y sin BOM) y XLSX.

**Datos de prueba:** name "José Ñandú", notes "Olvidé el reloj"

**Pasos**

1. Previsualizar cada archivo.

**Resultado esperado**

- Los textos llegan intactos (sin "Ã©" ni "Ã±").

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `import.service.spec.ts` | conserva acentos y eñes de un CSV en UTF-8 (con y sin BOM) |
| ✅ | Unitaria | `import.service.spec.ts` | conserva acentos al leer un XLSX |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | IMP: un CSV en UTF-8 conserva acentos y eñes en la vista previa |

<a id="tc-imp-10"></a>

### TC-IMP-10 · Fechas y decimales en archivos importados

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Importación masiva | Media | Funcional | 7.2 | ✅ Aprobado |

**Precondiciones**

- Archivo con fechas DD/MM/YYYY e ISO y distancias con coma.

**Datos de prueba:** 08/09/2026, 2026-09-08, "7,5"

**Pasos**

1. Previsualizar.

**Resultado esperado**

- DD/MM/YYYY se normaliza a ISO.
- Las fechas ISO no se corren por zona horaria.
- La coma decimal se acepta (7.5 km).

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `import.service.spec.ts` | normaliza fecha en formato DD/MM/YYYY |
| ✅ | Unitaria | `import.service.spec.ts` | acepta coma decimal en distanceKm |
| ✅ | Unitaria | `import.service.spec.ts` | conserva las fechas ISO de un CSV sin desfase de zona horaria |

<a id="tc-imp-11"></a>

### TC-IMP-11 · Autenticación con cuenta de servicio de Google

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Importación masiva | Media | Integración | 7.4 | ✅ Aprobado |

**Precondiciones**

- GOOGLE_SERVICE_ACCOUNT_EMAIL y GOOGLE_PRIVATE_KEY.

**Datos de prueba:** Clave privada en una sola línea con \n escapados

**Pasos**

1. Normalizar la clave.
2. Firmar el JWT y canjearlo por un access token.

**Resultado esperado**

- La clave se desescapa y se le quitan comillas.
- JWT RS256 con los claims del flujo de cuenta de servicio.
- El token se cachea; si Google no lo emite, el error es claro.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `sheets-auth.spec.ts` | desescapa \n y quita comillas de una variable de entorno de una línea |
| ✅ | Unitaria | `sheets-auth.spec.ts` | firma un JWT RS256 con los claims del flujo de cuenta de servicio |
| ✅ | Unitaria | `sheets-auth.spec.ts` | canjea el JWT por un access token y lo cachea |
| ✅ | Unitaria | `sheets-auth.spec.ts` | propaga un error claro si Google no emite el token |

<a id="ui"></a>

## Interfaz y navegación

| ID | Caso | Prioridad | Tipo | Estado |
|---|---|---|---|---|
| [TC-UI-01](#tc-ui-01) | Rutas privadas | Alta | Seguridad | ✅ Aprobado |
| [TC-UI-02](#tc-ui-02) | Menú según el rol | Alta | Seguridad | ✅ Aprobado |
| [TC-UI-03](#tc-ui-03) | Panel Mi reto | Media | UI | ✅ Aprobado |
| [TC-UI-04](#tc-ui-04) | Fechas sin desfase de zona horaria | Alta | Regresión | ✅ Aprobado |
| [TC-UI-05](#tc-ui-05) | Documentación interactiva de la API | Baja | Funcional | ✅ Aprobado |
| [TC-UI-10](#tc-ui-10) | El encabezado entra completo en escritorio y en móvil | Media | Regresión | ✅ Aprobado |
| [TC-UI-11](#tc-ui-11) | Un error inesperado al validar muestra el código para soporte | Media | UI | ✅ Aprobado |
| [TC-UI-06](#tc-ui-06) | El tema sigue al sistema por defecto | Media | UI | ✅ Aprobado |
| [TC-UI-07](#tc-ui-07) | Interruptor de modo claro/oscuro | Media | UI | ✅ Aprobado |
| [TC-UI-08](#tc-ui-08) | El tema elegido se aplica sin parpadeo | Media | UI | ✅ Aprobado |
| [TC-UI-09](#tc-ui-09) | Contraste y pantallas en ambos temas | Media | UI | ✅ Aprobado |

<a id="tc-ui-01"></a>

### TC-UI-01 · Rutas privadas

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Interfaz y navegación | Alta | Seguridad | 1.3 | ✅ Aprobado |

**Precondiciones**

- Sin sesión.

**Datos de prueba:** /dashboard

**Pasos**

1. Abrir una ruta privada.

**Resultado esperado**

- Redirige a /login.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | UI | `01-auth-navigation.spec.ts` | una ruta privada sin sesión redirige al login |

<a id="tc-ui-02"></a>

### TC-UI-02 · Menú según el rol

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Interfaz y navegación | Alta | Seguridad | 1.3 | ✅ Aprobado |

**Precondiciones**

- Sesión de participante y de administrador.

**Datos de prueba:** Navegación del dashboard

**Pasos**

1. Entrar como participante.
2. Entrar como administrador.

**Resultado esperado**

- El participante ve Mi reto, Subir actividad y Ranking, sin secciones de administración; Salir cierra la sesión.
- El admin ve además Retos, Participantes, Validaciones e Importar.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | UI | `01-auth-navigation.spec.ts` | el participante entra y no ve las secciones de administración |
| ✅ | UI | `01-auth-navigation.spec.ts` | el admin ve las cuatro secciones de administración |
| ✅ | Guía | `capture.spec.ts` | menú de administración y lista de retos |

<a id="tc-ui-03"></a>

### TC-UI-03 · Panel Mi reto

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Interfaz y navegación | Media | UI | 4.1 | ✅ Aprobado |

**Precondiciones**

- Participante en un reto activo.

**Datos de prueba:** Reto Octubre 2026 de demostración

**Pasos**

1. Abrir /dashboard.

**Resultado esperado**

- Muestra el período (01-sep → 31-oct), "Finaliza en Xd Yh Zm", Validados, Pendientes, Posición y Top del reto.
- La cuenta regresiva llega a cero a la medianoche local al terminar el último día (la fecha de fin es inclusiva, igual que para registrar actividades).

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Web (unitaria) | `dates.test.ts` | dayEndMs es la medianoche local al terminar el día (endDate inclusivo) |
| ✅ | Guía | `capture.spec.ts` | panel Mi reto muestra período, cuenta regresiva y métricas |

<a id="tc-ui-04"></a>

### TC-UI-04 · Fechas sin desfase de zona horaria

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Interfaz y navegación | Alta | Regresión | 4.4 | ✅ Aprobado |

**Precondiciones**

- Navegador en una zona al oeste de UTC (America/La_Paz).

**Datos de prueba:** Actividad registrada con fecha D

**Pasos**

1. Registrar la actividad.
2. Verla en Mis actividades.

**Resultado esperado**

- Se muestra exactamente el día D, no D-1.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Web (unitaria) | `dates.test.ts` | toDayKey devuelve el día calendario del valor del backend |
| ✅ | Web (unitaria) | `dates.test.ts` | formatDay no corre el día hacia atrás al oeste de UTC |
| ✅ | Web (unitaria) | `dates.test.ts` | formatDay usa el locale es-BO |
| ✅ | Web (unitaria) | `dates.test.ts` | isoToday devuelve el día local con formato YYYY-MM-DD |
| ✅ | UI | `02-activity-upload.spec.ts` | registra la actividad y la muestra con su fecha exacta |
| ✅ | Unitaria | `import.service.spec.ts` | conserva las fechas ISO de un CSV sin desfase de zona horaria |

<a id="tc-ui-05"></a>

### TC-UI-05 · Documentación interactiva de la API

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Interfaz y navegación | Baja | Funcional | 0.3 | ✅ Aprobado |

**Precondiciones**

- API en marcha en un entorno no productivo o con SWAGGER_ENABLED=true.

**Datos de prueba:** /api/docs

**Pasos**

1. Abrir Swagger.

**Resultado esperado**

- Lista los módulos de la API, entre ellos challenges y activities.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Guía | `capture.spec.ts` | Swagger documenta la API |

<a id="tc-ui-10"></a>

### TC-UI-10 · El encabezado entra completo en escritorio y en móvil

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Interfaz y navegación | Media | Regresión | 1.3 | ✅ Aprobado |

> Relacionado con DEF-06 (ver reporte de validación).

**Precondiciones**

- Dos retos activos (aparece el selector de reto).
- Sesión de administrador (siete secciones) y de participante.

**Datos de prueba:** Pantallas de 1280 × 800 y 390 × 844; reto "Reto Octubre 2026 (no inscrito)" en el selector del administrador

**Pasos**

1. Abrir /dashboard en escritorio y medir el texto del selector frente a su ancho disponible.
2. Abrir /dashboard en móvil.

**Resultado esperado**

- En escritorio el nombre del reto se ve completo y ni la página ni el encabezado se desbordan.
- En móvil el interruptor de tema y "Salir" quedan visibles en pantalla y la página no se desborda; las secciones pasan a una fila propia que se desplaza.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | UI | `09-header-layout.spec.ts` | en escritorio el administrador ve el nombre del reto completo y nada se desborda |
| ✅ | UI | `09-header-layout.spec.ts` | en móvil el encabezado del administrador no desborda la página |
| ✅ | UI | `09-header-layout.spec.ts` | en escritorio el participante ve el nombre del reto completo y nada se desborda |
| ✅ | UI | `09-header-layout.spec.ts` | en móvil el encabezado del participante no desborda la página |

<a id="tc-ui-11"></a>

### TC-UI-11 · Un error inesperado al validar muestra el código para soporte

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Interfaz y navegación | Media | UI | 5.2 | ✅ Aprobado |

**Precondiciones**

- Sesión de administrador con una actividad pendiente.
- La API responde 500 al validar (simulado).

**Datos de prueba:** Respuesta 500 con requestId "pw-req-1"

**Pasos**

1. Validar la actividad.

**Resultado esperado**

- El aviso de error muestra el mensaje con el código "pw-req-1" para compartir con el administrador.
- La actividad sigue pendiente.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | UI | `03-admin-validation.spec.ts` | un error inesperado al validar muestra el código para soporte |

<a id="tc-ui-06"></a>

### TC-UI-06 · El tema sigue al sistema por defecto

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Interfaz y navegación | Media | UI | 1.4 | ✅ Aprobado |

**Precondiciones**

- Navegador sin tema elegido (sin la clave reto.theme).

**Datos de prueba:** Sistema en modo claro; sistema en modo oscuro; cambio del sistema con la app abierta; valor guardado inválido

**Pasos**

1. Abrir /login con el sistema en claro y luego en oscuro.
2. Con la app abierta, cambiar el tema del sistema.

**Resultado esperado**

- Sistema claro: la web se ve clara (fondo rgb(246, 245, 242)); sistema oscuro o sin preferencia: oscura.
- Si el sistema cambia, la web lo sigue sin recargar.
- Un valor guardado que no es "light" ni "dark" se ignora.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Web (unitaria) | `theme.test.ts` | sin elección guardada sigue al sistema; sin preferencia del sistema queda oscuro |
| ✅ | Web (unitaria) | `theme.test.ts` | un valor guardado inválido se ignora |
| ✅ | UI | `07-theme.spec.ts` | sin elección guardada sigue el tema del sistema |
| ✅ | UI | `07-theme.spec.ts` | si el sistema cambia, la app lo sigue sin recargar |

<a id="tc-ui-07"></a>

### TC-UI-07 · Interruptor de modo claro/oscuro

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Interfaz y navegación | Media | UI | 1.4 | ✅ Aprobado |

**Precondiciones**

- Sesión de participante; sistema en modo oscuro.

**Datos de prueba:** Interruptor "Modo claro" (rol switch) del encabezado

**Pasos**

1. Pulsar el interruptor.
2. Recargar la página.
3. Cambiar el tema del sistema.
4. Con el foco en el interruptor, pulsar Espacio y luego Enter.

**Resultado esperado**

- Cambia al tema claro al instante y aria-checked pasa a true.
- La elección se guarda (reto.theme = light) y sobrevive la recarga.
- La elección guardada manda sobre el sistema.
- El teclado alterna el tema igual que el clic.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Web (unitaria) | `theme.test.ts` | la elección guardada manda sobre el sistema |
| ✅ | UI | `07-theme.spec.ts` | el interruptor cambia el tema al instante y la elección sobrevive la recarga |
| ✅ | UI | `07-theme.spec.ts` | el interruptor funciona con el teclado |
| ✅ | Guía | `capture.spec.ts` | interruptor de tema en el encabezado |

<a id="tc-ui-08"></a>

### TC-UI-08 · El tema elegido se aplica sin parpadeo

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Interfaz y navegación | Media | UI | 1.4 | ✅ Aprobado |

**Precondiciones**

- Tema claro guardado; sistema en modo oscuro.

**Datos de prueba:** reto.theme = light

**Pasos**

1. Abrir /login y leer data-theme en DOMContentLoaded, antes de que React hidrate.

**Resultado esperado**

- data-theme ya es "light" al terminar de analizar el documento: la página nunca se pinta en oscuro.
- El script previo a la hidratación resuelve igual que la lógica de la app, también con el almacenamiento bloqueado.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Web (unitaria) | `theme.test.ts` | el script previo a la hidratación resuelve igual que resolveTheme |
| ✅ | Web (unitaria) | `theme.test.ts` | si el almacenamiento está bloqueado, el script sigue al sistema |
| ✅ | UI | `07-theme.spec.ts` | el tema guardado se aplica antes de pintar y manda sobre el sistema |

<a id="tc-ui-09"></a>

### TC-UI-09 · Contraste y pantallas en ambos temas

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Interfaz y navegación | Media | UI | 1.4 | ✅ Aprobado |

**Precondiciones**

- Paletas definidas en frontend/app/globals.css.

**Datos de prueba:** Texto, texto secundario, estados e insignias sobre fondo, tarjeta y superficie elevada

**Pasos**

1. Medir el contraste de cada color sobre los fondos donde se usa, en los dos temas.
2. Abrir Mi reto, Subir actividad y Ranking en modo claro.

**Resultado esperado**

- Texto principal de al menos 4.5:1; texto secundario, estados e insignias de al menos 3:1; texto negro del botón principal de al menos 4.5:1.
- Fondo, texto y tarjetas usan la paleta clara, y la fecha de Subir actividad usa controles claros (color-scheme light).

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Web (unitaria) | `theme.test.ts` | contraste del tema oscuro |
| ✅ | Web (unitaria) | `theme.test.ts` | contraste del tema claro |
| ✅ | UI | `07-theme.spec.ts` | las pantallas principales y los controles nativos se ven en modo claro |

<a id="health"></a>

## Salud del servicio

| ID | Caso | Prioridad | Tipo | Estado |
|---|---|---|---|---|
| [TC-HEALTH-01](#tc-health-01) | Servicio vivo | Alta | Funcional | ✅ Aprobado |
| [TC-HEALTH-02](#tc-health-02) | Base de datos accesible | Alta | Funcional | ✅ Aprobado |
| [TC-HEALTH-03](#tc-health-03) | La readiness responde 503 con la base caída | Alta | Funcional | ✅ Aprobado |
| [TC-HEALTH-04](#tc-health-04) | Toda respuesta lleva un X-Request-Id y una línea de acceso segura | Alta | Funcional | ✅ Aprobado |
| [TC-HEALTH-05](#tc-health-05) | Apagado ordenado | Media | Funcional | ✅ Aprobado |

<a id="tc-health-01"></a>

### TC-HEALTH-01 · Servicio vivo

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Salud del servicio | Alta | Funcional | 8.1 | ✅ Aprobado |

**Precondiciones**

- API en marcha.

**Datos de prueba:** GET /api/health

**Pasos**

1. Consultar.

**Resultado esperado**

- 200 { status: "ok", timestamp }.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `app.e2e-spec.ts` | GET /api/health responde ok |

<a id="tc-health-02"></a>

### TC-HEALTH-02 · Base de datos accesible

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Salud del servicio | Alta | Funcional | 8.1 | ✅ Aprobado |

**Precondiciones**

- API y Postgres en marcha.

**Datos de prueba:** GET /api/health/db

**Pasos**

1. Consultar.

**Resultado esperado**

- 200 { status: "ok", db: "up" }.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `app.e2e-spec.ts` | GET /api/health/db verifica la conexión |

<a id="tc-health-03"></a>

### TC-HEALTH-03 · La readiness responde 503 con la base caída

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Salud del servicio | Alta | Funcional | 8.1 | ✅ Aprobado |

**Precondiciones**

- API en marcha.

**Datos de prueba:** GET /api/health/db y GET /api/health con la base detenida y de nuevo en marcha

**Pasos**

1. Detener Postgres y consultar ambos endpoints.
2. Levantar Postgres y consultar /api/health/db.

**Resultado esperado**

- /api/health/db responde 503 { status: "error", db: "down" } y deja una línea ERROR [HTTP] con su requestId.
- /api/health sigue en 200.
- Con la base de nuevo arriba, /api/health/db vuelve a 200.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `all-exceptions.filter.spec.ts` | un 503 deja una sola línea ERROR sin stack y conserva el cuerpo |
| ✅ | API e2e | `ops-observability.e2e-spec.ts` | OPS: con la base caída /api/health/db responde 503 y /api/health sigue en 200 |

<a id="tc-health-04"></a>

### TC-HEALTH-04 · Toda respuesta lleva un X-Request-Id y una línea de acceso segura

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Salud del servicio | Alta | Funcional | 8.1 | ✅ Aprobado |

**Precondiciones**

- API en marcha.

**Datos de prueba:** X-Request-Id válido e inválido; /api/no-existe, /fuera-del-prefijo, JSON mal formado; login con ?token=secreto

**Pasos**

1. Consultar con y sin X-Request-Id.
2. Consultar rutas inexistentes y enviar JSON mal formado.
3. Revisar las líneas [HTTP] de los logs.

**Resultado esperado**

- Un identificador válido se reutiliza; si falta o no es válido se genera un UUID.
- Las rutas inexistentes y el JSON mal formado (400) también traen X-Request-Id.
- Cada petición deja una sola línea [HTTP] con la plantilla de la ruta, sin contraseñas, tokens ni query; una petición abortada queda con 499.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `request-log.spec.ts` | reutiliza un identificador válido |
| ✅ | Unitaria | `request-log.spec.ts` | genera un UUID v4 si falta o no es válido |
| ✅ | Unitaria | `request-log.spec.ts` | usa la plantilla de la ruta si hubo handler |
| ✅ | Unitaria | `request-log.spec.ts` | sin handler usa el path sin query |
| ✅ | Unitaria | `request-log.spec.ts` | log por debajo de 400 y para 401 y 404; warn para el resto |
| ✅ | Unitaria | `request-log.spec.ts` | arma la línea con lista blanca: nunca cuerpo, query ni cabeceras |
| ✅ | Unitaria | `request-log.spec.ts` | incluye el usuario del JWT |
| ✅ | Unitaria | `request-log.spec.ts` | una petición abortada queda con 499 y aborted |
| ✅ | Unitaria | `request-context.spec.ts` | fija el identificador en la petición y en la cabecera, y sigue |
| ✅ | Unitaria | `request-context.spec.ts` | una respuesta terminada deja exactamente una línea |
| ✅ | Unitaria | `request-context.spec.ts` | una respuesta abortada deja una sola línea con 499 |
| ✅ | API e2e | `ops-observability.e2e-spec.ts` | OPS: X-Request-Id se reutiliza si es válido y si no se genera |
| ✅ | API e2e | `ops-observability.e2e-spec.ts` | OPS: la línea de acceso usa la plantilla de la ruta; las rutas inexistentes también llevan X-Request-Id |
| ✅ | API e2e | `ops-observability.e2e-spec.ts` | OPS: la línea de acceso no contiene contraseñas, tokens ni la query |
| ✅ | API e2e | `ops-observability.e2e-spec.ts` | OPS: el JSON mal formado responde 400 con X-Request-Id y sin línea ERROR |
| ✅ | API e2e | `ops-observability.e2e-spec.ts` | OPS: una petición abortada por el cliente deja una sola línea con 499 |

<a id="tc-health-05"></a>

### TC-HEALTH-05 · Apagado ordenado

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Salud del servicio | Media | Funcional | 8.1 | ✅ Aprobado |

**Precondiciones**

- API compilada en marcha.

**Datos de prueba:** SIGTERM (Linux, Seenode) o cierre de la app

**Pasos**

1. Enviar SIGTERM al proceso, o redesplegar en Seenode.

**Resultado esperado**

- Los logs muestran "Conexión a la base cerrada" antes de que el proceso termine.
- En Linux el proceso termina por la señal (código 143); es el cierre normal.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `ops-observability.e2e-spec.ts` | OPS: al cerrar la app se cierra la conexión a la base y queda registrado |

<a id="par"></a>

## Sesiones concurrentes

| ID | Caso | Prioridad | Tipo | Estado |
|---|---|---|---|---|
| [TC-PAR-01](#tc-par-01) | Dos roles trabajando a la vez | Alta | Integración | ✅ Aprobado |

<a id="tc-par-01"></a>

### TC-PAR-01 · Dos roles trabajando a la vez

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Sesiones concurrentes | Alta | Integración | 0.2 | ✅ Aprobado |

**Precondiciones**

- API en marcha con el seed cargado.

**Datos de prueba:** node scripts/parallel-session-test.mjs

**Pasos**

1. Ejecutar el script: admin y Ana con sesiones simultáneas registran, validan, consultan finanzas, puntaje y retos activos.

**Resultado esperado**

- Todos los chequeos en PASS (64): sesiones, registro y validación concurrentes, RBAC, finanzas, puntaje y varios retos activos.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Sesiones | `parallel-session-test.mjs` | todos los chequeos (70) |
