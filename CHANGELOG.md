# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Versionado [SemVer](https://semver.org/lang/es/).

## [1.5.0] — 2026-10-05

La versión con la que se estrena producción: observabilidad básica para operar la API y
protección de las subidas a Cloudinary. **No trae migraciones.**

**Antes de desplegar (dueño):**
- **En Seenode:**
  - Start Command: `npx prisma migrate deploy && exec node dist/main.js`.
  - Health check en `/api/health`.
  - `SWAGGER_ENABLED` sin definir.
  - Un monitor externo sobre `/api/health/db`.
- **En Cloudinary:** activar la entrega de PDF y, antes de abrir la URL a los participantes,
  correr las verificaciones V1 a V5 del runbook.

**Para volver a la 1.4.2:** desplegar API y web juntas, porque cambia el contrato de subida.

### Añadido

- **Observabilidad básica** (cambio `ops-observability-baseline`, spec `platform-operations`):
  - Toda respuesta trae la cabecera `X-Request-Id`; si llega una válida se reutiliza.
  - Cada petición deja una línea `[HTTP]` en JSON con ruta, estado, duración y usuario, sin
    contraseñas, tokens ni query string.
  - Un error inesperado responde un 500 genérico en español con el código para soporte, sin el
    detalle interno, y deja una sola línea `ERROR` con ese código. Los errores de negocio no
    cambian.
  - Apagado ordenado: al redesplegar se cierra la conexión a la base y queda registrado.
  - Variable `SWAGGER_ENABLED`; `PUBLIC_URL` queda documentada.

### Cambiado

- **`GET /api/health/db` responde 503** cuando la base no responde (antes respondía 200 con
  `db: 'down'`). `GET /api/health` no cambia.
- **Swagger apagado en producción** por defecto: `/api/docs` responde 404 salvo con
  `SWAGGER_ENABLED=true`.
- **Start Command de la API:** `npx prisma migrate deploy && exec node dist/main.js`, para que la
  señal de apagado llegue al proceso. El health check de Seenode sigue en `/api/health`, y
  `/api/health/db` queda para un monitor externo.
- **Contrato de subida (rompe compatibilidad; API y web salen juntas):**
  - `POST /api/upload/sign` recibe `{ challengeId, purpose }` y responde además
    `allowedFormats` y `maxBytes`. Enviar `folder` o `resourceType` responde 400.
  - El endpoint de pago del admin ya no acepta campos de comprobante (400).

### Seguridad

- **Protección de subidas** (cambio `upload-guardrails`, spec `upload-guardrails`):
  - Solo los inscritos en un reto pueden firmar subidas: las fotos requieren un reto activo y los
    comprobantes un reto sin cerrar. Quien no participa recibe 403, admin incluido.
  - La carpeta la decide el servidor: `<base>/<reto>/<usuario>/<propósito>`.
  - Los formatos van firmados: JPG, PNG, WEBP y HEIC para las fotos; además PDF para los
    comprobantes.
  - Cada foto (incluida la captura de FC) y cada comprobante deben ser archivos propios subidos a
    esa carpeta. Una imagen de otro sitio o de otro participante responde 400. La importación del
    admin no cambia.
  - Límite de firmas por cliente y minuto: `UPLOAD_SIGN_LIMIT`, 30 por defecto.
  - El simulador local de desarrollo aplica las mismas reglas.
  - La web valida el tamaño antes de subir y muestra los errores de formato y tamaño en español.
  - **Antes de abrir la URL:** en Cloudinary, activar la entrega de PDF y correr las
    verificaciones V1 a V5 del runbook.

## [1.4.2] — 2026-10-04

Parche de seguridad previo al primer despliegue: cada participante ve solo sus propios datos de
pago y nadie ve el email de los demás, salvo el admin. **No trae migraciones**; volver a la 1.4.1
es solo volver a desplegar el código, API y web juntas.

### Seguridad

- **Privacidad de los participantes** (cambio `participant-data-privacy`): un participante ya no
  recibe el email ni los datos de pago de otras personas.
  - El ranking y los resultados muestran nombres y puntajes, sin email ni estado de pago. El pote
    sigue siendo público.
  - El detalle del reto y la lista de retos activos ya no traen la lista de inscritos al
    participante; su propio pago llega en el campo nuevo `me`.
  - El listado de inscritos es solo para el admin (403 al participante).
  - El detalle de una actividad es solo para su dueño o el admin (403 "No puedes ver esta
    actividad").
  - El admin conserva todo lo que veía.

### Cambiado

- **Contrato de la API:** para un participante, `GET /challenges/active/list`,
  `GET /challenges/active` y `GET /challenges/:id` ya no incluyen `participants` y suman `me`; las
  filas de `GET /challenges/:id/results` ya no incluyen `email` ni `paid`. La web de esta versión
  ya usa la forma nueva. Sin cambios en la base de datos.

## [1.4.1] — 2026-10-04

Versión de mantenimiento: solo herramientas de desarrollo. No cambia la aplicación, la API ni los
datos, y **no trae migraciones**; volver a la 1.4.0 es solo volver a desplegar el código.

### Cambiado

- **Herramientas de desarrollo del backend al día** (cambio `upgrade-dev-tooling`): Jest 30,
  typescript-eslint 8 y ts-loader 9.6. Con esto el advisory de `braces` ≤ 3.0.3
  (GHSA-vfj7-8cjw-p6xm), que no tiene versión corregida, deja de aparecer en el backend: `npm audit`
  pasa de 37 avisos altos a 0. En el frontend solo se aplicaron las correcciones menores; quedan 7
  avisos de la misma cadena en Tailwind 3 y en el plugin de ESLint de Next.js, aceptados porque
  ninguna versión actual los resuelve. Producción sigue sin avisos y no cambia nada de la
  aplicación.

## [1.4.0] — 2026-10-03

El premio se reparte con lo recaudado, el presupuesto se calcula solo con las cuotas y un reto
cerrado ya no acepta pagos. **Antes de desplegar: esta versión trae una migración** (la primera
desde la 1.0.0); tomar el respaldo de la base que indica el runbook. Volver a la 1.3.0 exige
restaurar ese respaldo.

### Cambiado

- **El premio se reparte con lo recaudado** (spec `challenge-finance`, cambio `pot-from-collected`):
  el pote de los resultados es la suma de los pagos confirmados, no el presupuesto. El premio es
  monetario cuando el reto cobra cuota; un reto con cuota y sin pagos muestra "aún no hay pagos
  registrados". Quien no pagó puede ganar igual.
- **Presupuesto automático:** por defecto es cuota × inscritos y se recalcula al inscribir o quitar
  personas o cambiar la cuota; el admin puede fijar otro monto y volver a automático. El resumen
  financiero informa `budgetMode` (`auto` o `manual`).
- **Un reto cerrado no acepta pagos ni comprobantes** (400): el pago tardío se registra en el reto
  siguiente, y el premio de un reto cerrado queda fijo.
- **Migración de base de datos** (la primera desde la 1.0.0): `Challenge.budgetTotal` pasa a ser
  opcional. Los presupuestos en 0 o iguales a cuota × inscritos se vuelven automáticos; el resto se
  conserva como monto fijado. Tomar respaldo antes de desplegar (ver el runbook).

### Corregido

- El panel de premiación no actualizaba los ganadores sugeridos si cambiaban sin que cambiara
  el puntaje tope. Ahora la preselección sigue a la sugerencia y se conserva lo que el
  administrador marcó mientras la sugerencia no cambie. El frontend queda sin avisos de lint.

## [1.3.0] — 2026-10-02

Backend sin avisos de seguridad (NestJS 11), tres acciones que solo existían por API ahora en
la web, y retos cerrados definitivos. Sin migraciones. **Antes de desplegar:** el build necesita
acceso a `cdn.sheetjs.com` y `JWT_*_EXPIRES_IN` deben ser duraciones válidas (ver el runbook).

### Añadido

- **Acciones que solo existían por API, ahora en la web** (spec `web-api-only-actions`):
  editar las reglas de un reto en borrador o activo (mismo formulario, mes y año fijos, solo se
  envía lo que cambió), registrar un pago parcial indicando el monto recibido, y retirar una
  actividad pendiente desde "Mis actividades" con confirmación. Resuelve la observación OBS-02.

### Seguridad

- **Backend sin avisos de dependencias** (antes 12, cinco altos). NestJS 10 → 11.2.7 (Express 5,
  multer 2.4), `js-yaml` 5.4.2 por `overrides` y `xlsx` 0.20.3 desde el CDN oficial de SheetJS.
  La CI ahora falla ante cualquier aviso moderado o mayor.

### Cambiado

- `JWT_ACCESS_EXPIRES_IN` y `JWT_REFRESH_EXPIRES_IN` deben ser duraciones válidas (`900`, `15m`,
  `7d`): un valor mal escrito hace fallar el arranque con un mensaje claro.
- Instalar las dependencias del backend requiere acceso a `cdn.sheetjs.com`.
- **Un reto cerrado es definitivo:** la API rechaza (400) cualquier cambio a un reto cerrado,
  incluido devolverlo a borrador; registrar su premiación sigue permitido y volver a cerrarlo no
  es un error. Resuelve la observación OBS-03. Las herramientas de prueba borran sus retos de
  prueba en la base local (`scripts/lib/test-db.mjs`) en vez de reabrirlos.

### Corregido

- Editar un reto no comprobaba que el inicio fuera anterior al fin, como sí lo hace al crearlo.

## [1.2.0] — 2026-10-02

Los resultados de los retos cerrados se consultan en la web y el encabezado funciona en el
celular. Sin cambios de base de datos, de API ni de variables: actualizar es desplegar.

### Añadido

- **Retos cerrados en el Ranking** (spec `challenge-lifecycle`). Cualquier usuario elige un reto
  cerrado en el Ranking y ve su ranking final, los ganadores y el premio final, en solo
  lectura. La dirección (`/dashboard/results?reto=<id>`) se puede compartir, el reto activo
  del encabezado no cambia y, sin retos activos, la página ofrece los cerrados. Resuelve la
  observación OBS-01 del catálogo de casos.

### Corregido

- El encabezado no entraba: con las siete secciones del administrador el selector cortaba el
  nombre del reto, y en el celular el selector, el interruptor de tema y "Salir" quedaban fuera
  de la pantalla. Ahora la marca y los controles van arriba y las secciones en una fila propia
  que se desplaza.

## [1.1.0] — 2026-10-02

Modo claro, sesiones estables ante picos de tráfico y un catálogo de casos de prueba validado
contra las suites reales. Sin cambios de base de datos ni de API: actualizar es desplegar.

### Añadido

- **Modo claro** (spec `web-theme`). La web tiene tema claro y oscuro en todas las pantallas.
  Por defecto sigue el tema del dispositivo; un interruptor en el encabezado lo cambia y
  cada navegador recuerda la elección, aplicada antes de pintar para que no haya parpadeos.
  El contraste de ambas paletas se mide en `npm test` (frontend).
- **Catálogo de casos de prueba validado** (`docs/qa/`): 99 casos con precondiciones, datos,
  pasos, resultado esperado y las pruebas exactas que validan cada uno.
  `node scripts/validate-test-cases.mjs` corre las suites, cruza cada caso con sus pruebas y
  regenera el catálogo (Markdown y CSV) y el reporte de validación; falla si un caso falla o
  si un enlace no encuentra su prueba.
- **Capturas en la guía interactiva**: 22 pantallas de la web real en modo claro, generadas por
  `e2e/guide/capture.spec.ts` sobre un reto de demostración, dentro de un marco de ventana de
  navegador y con visor ampliado.
  `scripts/build-guide-artifact.mjs` arma una versión autocontenida para publicar.
- **Pruebas nuevas**: `backend/test/platform-rules.e2e-spec.ts` (30 reglas de la API que solo
  estaban descritas a mano) y recorridos de Playwright para la renovación de tokens, un 429
  transitorio y un corte de red durante la renovación.
- Variables `TRUST_PROXY`, `THROTTLE_LIMIT` y `THROTTLE_TTL_MS` para el limitador de peticiones.

### Cambiado

- **En producción la API confía por defecto en un proxy delante** (`TRUST_PROXY=1`), que es lo
  que ocurre en Seenode y Render. Si el servicio recibe tráfico directo, sin proxy, define
  `TRUST_PROXY=false`.
- La documentación de Swagger (`/api/docs`) informa la versión real de la API.

### Corregido

- La importación CSV dañaba acentos y eñes ("OlvidÃ© el reloj"): los CSV se leen como UTF-8,
  con o sin BOM.
- Un 429 del limitador o un corte de red cerraban la sesión del usuario. Ahora solo un 401 (o
  un refresh token rechazado) la cierra, y la web reintenta los errores transitorios.
- Cambiar de página mientras se renovaba el token enviaba al login.
- Detrás de un proxy, todos los usuarios compartían el cupo de 100 peticiones por minuto: en
  producción la API confía en un proxy por defecto y limita por IP real.
- El ranking mostraba el tope en días aunque el reto puntuara en puntos.
- El panel de premiación sugería a los empatados por días validados en vez de los ganadores
  que dan las reglas del reto.
- La cuenta regresiva de "Mi reto" marcaba "Finalizado" la noche anterior al último día en
  zonas al oeste de UTC; ahora llega a cero al terminar ese día, que sigue admitiendo
  actividades.

## [1.0.0] — 2026-09-09

Primera versión estable. El MVP queda completo: las cuatro brechas del mapa de reglas están
resueltas, la importación tiene su segunda fase, y la plataforma llega al despliegue con una
batería automatizada de punta a punta.

### Añadido

- **Varios retos activos a la vez** (spec `challenge-lifecycle`). La activación es una
  transición explícita (`DRAFT → ACTIVE`, idempotente, sin reactivar cerrados) y pueden
  coexistir varios retos abiertos. Nuevo `GET /challenges/active/list` con `isParticipant`,
  y un selector en el encabezado que recuerda la elección del participante.
- **Regla de frecuencia cardíaca automática** (spec `activity-heart-rate-compliance`).
  Nuevo campo `heartRateMinutes` en la actividad; el registro se rechaza si no llega al
  mínimo del reto o falta la captura, y el admin solo puede validar una actividad que no
  cumple con un override y una nota que queda registrada. La importación reporta esas filas
  como advertencias en vez de errores.
- **Conciliación de cuota y presupuesto** (spec `challenge-finance`). Estado de pago por
  participante (`paid`, `partial`, `unpaid`), nuevo `GET /challenges/:id/finance` con los
  totales esperado, recaudado y pendiente más la cobertura del presupuesto, y el premio por
  ganador calculado en los resultados.
- **Reglas de puntaje configurables por reto** (spec `challenge-scoring`). Puntos por día y
  por kilómetro, mínimo de días para calificar, número de ganadores y regla de desempate
  (sorteo, kilómetros o repartir entre todos). Los valores por defecto reproducen el
  comportamiento anterior.
- **Importación directa desde Google Sheets** (spec `google-sheets-import`). Endpoints de
  estado, previsualización e importación con cuenta de servicio, reutilizando la misma
  validación e idempotencia que la carga por archivo. Sin credenciales configuradas, la
  integración queda deshabilitada y la carga por archivo sigue funcionando.
- **Simulador local de subidas** para desarrollar sin credenciales de Cloudinary.
- **Batería automatizada** con un solo comando (`node scripts/run-tests.mjs`): lint,
  unitarias, build, migraciones, e2e de API, tipos, sesiones paralelas y recorridos de UI.
- **Pruebas de interfaz con Playwright** (`e2e/`): 19 recorridos sobre navegador real, con
  subida de archivos de punta a punta. Corren también en integración continua.
- **Documentación**: guía de pruebas paso a paso, batería automatizada, Playwright,
  arquitectura, reglas del reto, plantilla de importación, seguridad y despliegue.

### Corregido

- **Arranque en producción**: la compilación dejaba la salida en `dist/src/main.js` mientras
  el comando de arranque documentado usaba `dist/main.js`. El despliegue habría fallado.
  Además, el archivo de compilación incremental fuera de `dist` provocaba builds vacíos en
  silencio.
- **Subida de archivos en producción**: el simulador local se activaba por la sola ausencia
  de credenciales y su endpoint no pedía sesión, así que un despliegue sin Cloudinary dejaba
  un punto público de escritura en disco. Ahora queda deshabilitado y el endpoint exige
  sesión.
- **CORS**: sin `CORS_ORIGIN` la API caía a comodín junto con credenciales. En producción ya
  no habilita ningún origen y avisa por registro.
- **Seed en producción**: creaba participantes de demostración con contraseña conocida y
  admitía una contraseña de administrador por defecto. Ahora exige `SEED_ADMIN_PASSWORD` y
  omite los datos de demostración salvo petición explícita.
- **Fechas desfasadas**: los días se mostraban corridos un día en zonas al oeste de UTC, y
  el formulario proponía la fecha de mañana por la noche.
- **Importación**: las fechas ISO de un CSV se interpretaban con desfase de zona horaria.
- **Accesibilidad**: los campos del formulario de actividad no estaban asociados a sus
  etiquetas.

### Cambiado

- Next.js de 14.2 a 15.5 y `postcss` forzado a 8.5 para cerrar una alerta crítica; el
  frontend queda sin vulnerabilidades conocidas.
- La base de datos local se expone en el puerto 5433 y el frontend de desarrollo en el 3005,
  para no chocar con otros proyectos.
- Integración continua: tres trabajos (backend, frontend y recorridos de UI) más una puerta
  que falla ante alertas críticas de dependencias.
- Node fijado a 20 o 22 en los tres paquetes.

### Conocido y pendiente

- El backend arrastra 12 alertas de dependencias (5 altas), once transitivas de NestJS 10
  que se resuelven subiendo a NestJS 12, y `xlsx` sin versión corregida en npm. Analizadas
  en `docs/security-owasp.md`.
- La subida real a Cloudinary y la lectura real de una hoja de Google no tienen cobertura
  automatizada: requieren credenciales y se verifican a mano.
- Preguntas de negocio abiertas en `docs/challenge-rules.md`: si quien no pagó puede ganar y
  si el premio debe salir de lo recaudado en vez del presupuesto.

## [0.1.0] — 2026-05-10

MVP inicial: autenticación con roles, retos mensuales, participantes y pagos, registro y
validación de actividades, resultados con ranking y premiación, importación masiva por
archivo, salud del servicio, pruebas y despliegue documentado.
