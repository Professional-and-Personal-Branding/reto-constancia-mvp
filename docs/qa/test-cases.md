# Catálogo de casos de prueba

> Documento generado por `node scripts/validate-test-cases.mjs` a partir de [catalog.mjs](catalog.mjs). No lo edites a mano: cambia el catálogo y vuelve a validar.
> Última validación: **2026-10-02** · rama `feature/web-api-only-actions` · commit `4d348f8` (con cambios sin commit). Detalle en [validation-report.md](validation-report.md).

**102 casos** · 102 aprobados · 0 fallidos · 0 con limitación conocida · 101 automatizados.

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
| [Seguridad y configuración](#sec) | 5 | 5 | 0 |
| [Gestión de retos](#chal) | 13 | 13 | 0 |
| [Participantes y pagos](#part) | 6 | 6 | 0 |
| [Actividades y validación](#act) | 19 | 19 | 0 |
| [Resultados y premiación](#res) | 6 | 6 | 0 |
| [Reglas de puntaje](#score) | 7 | 7 | 0 |
| [Finanzas](#fin) | 5 | 5 | 0 |
| [Carga de archivos](#up) | 3 | 3 | 0 |
| [Importación masiva](#imp) | 11 | 11 | 0 |
| [Interfaz y navegación](#ui) | 10 | 10 | 0 |
| [Salud del servicio](#health) | 2 | 2 | 0 |
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
- La respuesta incluye participants.

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

<a id="part"></a>

## Participantes y pagos

| ID | Caso | Prioridad | Tipo | Estado |
|---|---|---|---|---|
| [TC-PART-01](#tc-part-01) | Inscribir participantes | Alta | Funcional | ✅ Aprobado |
| [TC-PART-02](#tc-part-02) | Inscripción duplicada | Media | Negativo | ✅ Aprobado |
| [TC-PART-03](#tc-part-03) | Quitar a un participante | Media | Funcional | ✅ Aprobado |
| [TC-PART-04](#tc-part-04) | Registrar el pago de un participante | Alta | Funcional | ✅ Aprobado |
| [TC-PART-05](#tc-part-05) | Comprobante de pago del participante | Media | Funcional | ✅ Aprobado |
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
- El admin ve "Ver comprobante de pago".

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | PART: el participante sube su comprobante de pago |
| ✅ | Guía | `capture.spec.ts` | comprobante de pago disponible para el participante |
| ✅ | Guía | `capture.spec.ts` | participantes con resumen financiero |

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
- winners = premiados aunque el cálculo diga otra cosa; payout reparte entre ellos (300 a 1 premiado con pote 300).
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
| [TC-FIN-04](#tc-fin-04) | Premio por ganador en los resultados | Alta | Funcional | ✅ Aprobado |
| [TC-FIN-05](#tc-fin-05) | Finanzas en la web | Media | UI | ✅ Aprobado |

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
- budgetCovered false y budgetDelta -180.
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

### TC-FIN-04 · Premio por ganador en los resultados

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Finanzas | Alta | Funcional | 6.1 | ✅ Aprobado |

**Precondiciones**

- Presupuesto 600.

**Datos de prueba:** 1 ganador; 2 empatados; 3 premiados; presupuesto 0

**Pasos**

1. Consultar results.payout en cada escenario.

**Resultado esperado**

- perWinner 600, 300 y 200.
- Presupuesto 0: monetary false y perWinner 0.
- El reparto nunca supera el pote (redondeo hacia abajo); sin ganadores perWinner 0.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `finance.service.spec.ts` | un ganador se lleva el pote |
| ✅ | Unitaria | `finance.service.spec.ts` | dos ganadores reparten |
| ✅ | Unitaria | `finance.service.spec.ts` | tres premiados |
| ✅ | Unitaria | `finance.service.spec.ts` | pote 0 -> premio no monetario |
| ✅ | Unitaria | `finance.service.spec.ts` | sin ganadores -> perWinner 0 |
| ✅ | Unitaria | `finance.service.spec.ts` | el reparto nunca supera el pote (redondeo hacia abajo) |
| ✅ | Unitaria | `results.service.spec.ts` | presupuesto 0 -> premio no monetario |
| ✅ | API e2e | `challenge-finance.e2e-spec.ts` | results incluye payout: pote 600 para un ganador |
| ✅ | API e2e | `challenge-finance.e2e-spec.ts` | un reto con presupuesto 0 reporta premio no monetario |
| ✅ | Sesiones | `parallel-session-test.mjs` | Results incluye payout con pote = presupuesto |

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

- Tarjetas Esperado 750, Recaudado 375, Pendiente y Presupuesto, actualizadas al instante.
- Chip Parcial con el monto.
- Ranking: "Premio: X BOB por ganador", marcado proyectado.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | UI | `04-finance.spec.ts` | el resumen financiero refleja los pagos al instante |
| ✅ | UI | `04-finance.spec.ts` | el ranking muestra el premio por ganador |
| ✅ | Guía | `capture.spec.ts` | participantes con resumen financiero |

<a id="up"></a>

## Carga de archivos

| ID | Caso | Prioridad | Tipo | Estado |
|---|---|---|---|---|
| [TC-UP-01](#tc-up-01) | Firma de subida | Alta | Seguridad | ✅ Aprobado |
| [TC-UP-02](#tc-up-02) | Simulador local de subidas en desarrollo | Media | Funcional | ✅ Aprobado |
| [TC-UP-03](#tc-up-03) | Sin simulador local en producción | Alta | Seguridad | ✅ Aprobado |

<a id="tc-up-01"></a>

### TC-UP-01 · Firma de subida

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Carga de archivos | Alta | Seguridad | 4.3 | ✅ Aprobado |

**Precondiciones**

- Ninguna.

**Datos de prueba:** POST /api/upload/sign { folder, resourceType }

**Pasos**

1. Firmar sin sesión.
2. Firmar con sesión.

**Resultado esperado**

- Sin sesión: 401.
- Con sesión: 201; en desarrollo { local: true, uploadUrl: .../api/upload/local }.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | UP: firmar una subida exige sesión (401) y con sesión devuelve la firma |

<a id="tc-up-02"></a>

### TC-UP-02 · Simulador local de subidas en desarrollo

| Módulo | Prioridad | Tipo | Paso de la guía | Estado |
|---|---|---|---|---|
| Carga de archivos | Media | Funcional | 0.1 | ✅ Aprobado |

**Precondiciones**

- Sin Cloudinary, NODE_ENV distinto de production.

**Datos de prueba:** POST /api/upload/local (multipart file)

**Pasos**

1. Subir sin sesión.
2. Comprobar que el simulador está activo.

**Resultado esperado**

- Sin sesión: 401.
- Sin Cloudinary en desarrollo el simulador queda activo.

**Validación automatizada**

| | Suite | Archivo | Prueba |
|---|---|---|---|
| ✅ | Unitaria | `upload.service.spec.ts` | sin Cloudinary en desarrollo activa el simulador local |
| ✅ | API e2e | `platform-rules.e2e-spec.ts` | UP: el simulador local de subidas exige sesión (401) |

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

- API en marcha.

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
| ✅ | Sesiones | `parallel-session-test.mjs` | todos los chequeos (65) |
