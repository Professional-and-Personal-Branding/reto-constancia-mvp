# Propuestas de evolución de la plataforma "Reto de Constancia" (base 1.4.1)

## 1. Resumen ejecutivo

Revisamos 12 candidatos. Cuatro llegaron a la final y los cuatro sobreviven al desafío adversarial: observabilidad mínima de operación, privacidad de datos de participantes, congelamiento del reto cerrado con sorteo persistido, y protecciones de subida a Cloudinary. Tres de ellos atacan riesgos que existen hoy y que se vuelven públicos con el primer despliegue:
- `/health/db` responde 200 aunque la base esté caída.
- Los emails y los comprobantes de pago de todos los participantes quedan expuestos a cualquier usuario.
- Cualquier persona que se registre puede firmar subidas a cualquier carpeta y gastar la cuota de Cloudinary del dueño.

El congelamiento corrige un fallo de integridad con dinero real en juego: el sorteo cambia de ganadores en cada recarga. Ese cambio no bloquea el despliegue.

**Orden recomendado:**
1. Antes del despliegue: `participant-data-privacy` (1.4.2), `ops-observability-baseline` y el tramo A de `upload-guardrails`.
2. Justo después: `closed-challenge-freeze`.
3. Más adelante: el resto, empezando por los incrementos baratos de cada candidato.

## 2. Método

**Exploración.** Hicimos una exploración ReAct de solo lectura sobre el repositorio, las specs de OpenSpec, el runbook y el catálogo QA.

**Generación.** Cuatro perfiles generaron ideas: administrador, participante, crecimiento y operaciones. Fusionamos los duplicados y quedaron 12 candidatos.

**Votación.** Cinco jueces puntuaron cada candidato: valor de negocio, experiencia del usuario, factibilidad, impacto en el despliegue y costo. Ordenamos con conteo Borda y desempatamos con el promedio.

**Refinamiento.** Los cuatro primeros pasaron por tres rondas de evaluador-optimizador. Cada ronda terminó con una reflexión explícita sobre por qué había fallado el borrador anterior.

**Desafío adversarial.** Al final, dos escépticos por finalista verificaron las afirmaciones contra el código instalado (`node_modules`, servicios, specs) y propusieron correcciones.

## 3. Ranking completo

| Puesto | Idea | Borda | Promedio | A favor / en contra |
|---|---|---|---|---|
| 1 | Readiness 503 real, filtro global de errores con requestId, shutdown hooks y Swagger opcional (`ops-observability-baseline`) | 15 | 7,0 | Higiene básica de lanzamiento, cambios pequeños y sin dependencias nuevas / valor indirecto para el usuario |
| 2 | Ranking y detalle de reto sin emails ni datos de pago ajenos (`participant-data-privacy`) | 13 | 8,2 | Cierra una fuga real y deja de exhibir a quien no pagó, sin cambiar el esquema / cambia formas de respuesta que usan el frontend y los e2e |
| 3 | Cierre asistido y congelamiento del reto COMPLETED con sorteo DRAW persistido (`closed-challenge-freeze`) | 11 | 7,6 | Corrige ganadores que cambian al recargar y protege el reparto del premio / el modal de cierre suma alcance |
| 4 | Cloudinary: firma restringida, validación de evidencias y limpieza de huérfanos (`upload-guardrails`) | 9 | 6,6 | Protege la cuota del dueño ante el registro público, sin migración / requiere probar contra la cuenta real, que aún no existe |
| 5 | Exportación CSV del reto cerrado como acta de cuentas (`challenge-export-csv`) | 6 | 6,6 | Respaldo liviano y registro de quién pagó y quién ganó / solo lo usa el admin |
| 6 | Conciliación de pagos: "comprobante por revisar" (`payment-reconciliation`) | 5 | 6,8 | Menos trabajo de conciliación y estado de pago claro / depende de `me` (privacidad); el checklist de cierre cubre el riesgo principal a menor costo |
| 7 | Calendario "Mi mes" (`participant-my-month-calendar`) | 5 | 6,4 | La mejor palanca de motivación (usuario 10) / la lógica de días válidos duplicada en el cliente puede desalinearse; mucha carga de E2E |
| 8 | Corregir y reenviar una actividad rechazada (`resubmit-rejected-activity`) | 4 | 6,0 | Más justo y evita borrados por Swagger / el incremento 2 necesita migración y depende de upload-guardrails |
| 9 | Renovación mensual: duplicar reto, inscripción múltiple y código de invitación (`enrollment-at-scale-renewal`) | 3 | 6,0 | Elimina la tarea repetitiva más grande del mes / el código de invitación agrega migración y superficie de abuso |
| 10 | Mi perfil: contraseña, nombre e historial (`participant-profile-history`) | 3 | 6,0 | El incremento 1 cubre la rotación de la contraseña del admin semilla / el historial agrega pruebas para un valor aún no probado |
| 11 | Administración de usuarios: reset sin email, rol, estado y desactivación inmediata (`admin-user-management`) | 1 | 6,0 | Elimina soporte vía Swagger o base de datos / la consulta a la base en `JwtStrategy.validate` corre en cada petición y la parte de auth es sensible |
| 12 | Operación multi-reto: cola por reto, validación masiva y retos paralelos en el mismo mes (`multi-challenge-operations`) | 0 | 5,8 | El incremento 1 es casi gratis / quitar `@@unique([month, year])` es una migración riesgosa antes del lanzamiento |

---

## 4. Finalistas

Convención: **[Escéptico]** marca lo que cambió o debe cambiar por las objeciones del desafío adversarial. Los "pendientes" son observaciones del evaluador final que todavía no se incorporaron al texto.

### 4.1 `ops-observability-baseline`: readiness 503, requestId, filtro global, apagado ordenado y Swagger opcional

- **Capacidad:** `platform-operations`, nueva (delta ADDED).
- **Versión objetivo:** 1.5.0.
- **Esfuerzo:** S, de 2,5 a 3 días.
- **Puntaje final del evaluador:** 7,0 (rondas: 7,5 → 7,5 → 7,0).
- **Estado:** sobrevive (objeciones menores).

**Por qué**

| Problema | Evidencia |
|---|---|
| La readiness miente: devuelve 200 con `db: 'down'`, así que un monitor queda en verde con la base caída. El runbook depende de esta señal en tres lugares. | `health.controller.ts:23-25` |
| No hay filtro global, ni requestId, ni log de acceso, aunque el runbook promete que los 5xx quedan registrados con la ruta. | — |
| No hay `enableShutdownHooks()`, y el Start Command `... && node dist/main.js` no garantiza que la señal llegue a Node. | — |
| Swagger es siempre público y expone el mapa de los endpoints de administración. | `main.ts:58-66` |
| `PUBLIC_URL` no aparece en `.env.example` ni en el runbook. | — |

**Qué cambia**

1. **Readiness.**
   - `PrismaService.ping()` ejecuta `SELECT 1`.
   - `/api/health/db` lanza `ServiceUnavailableException` (503) con el mismo cuerpo.
   - `/api/health` (liveness) no cambia.
2. **`applyRequestContext(app)` a nivel Express.** Se llama justo después de `NestFactory.create`, de modo que corre antes que body-parser, `/uploads` y las rutas.
   - Acepta un `X-Request-Id` que cumpla `^[A-Za-z0-9._-]{1,64}$`; si no lo hay o es inválido, genera un `randomUUID()`.
   - Lo devuelve en la cabecera y lo expone por CORS.
   - Registra una única línea de acceso con `res.once('close')`: estado 499 y `aborted: true` si el cliente abortó.
3. **Log de acceso.** JSON con `{requestId, method, route, status, ms, userId}`. Nivel `log` por debajo de 400, `warn` desde 400. El nivel `error` queda reservado para el filtro.
4. **`AllExceptionsFilter`**, registrado como `APP_FILTER`:
   - HttpException por debajo de 500: `super.catch()`, sin cambios.
   - HttpException desde 500: una línea ERROR sin stack, y luego `super.catch()`.
   - Todo lo demás: un 500 genérico en español con el requestId y una línea ERROR con stack. El mensaje interno nunca viaja en la respuesta.
5. **Apagado.** `enableShutdownHooks()` sin `useProcessExit`. El proceso termina por la señal (código 143), que es la convención esperada. Se registra "Conexión a la base cerrada" y el Start Command pasa a usar `exec node dist/main.js`.
6. **`SWAGGER_ENABLED`.** Si no está definida, Swagger queda apagado en producción y encendido fuera de ella.
7. **Documentación y versión.** Bump a 1.5.0 con `npm version` (no buscar y reemplazar, porque `frontend/package-lock.json:4336` es otro paquete). Se actualizan el runbook, `.env.example`, el catálogo QA (TC-HEALTH-03/04, TC-SEC-06/07 y un TC-UI) y el CHANGELOG.
8. **Aclaración del runbook.** El "1.5" de la línea 81 del runbook es la sección §1.5, no una release.

**Correcciones de los escépticos**

- **[Escéptico] Error factual en §2.4.** El JSON mal formado no llega al filtro como objeto http-errors. `RoutesResolver.mapExternalException` (`routes-resolver.js:94-100`) lo convierte antes en `BadRequestException`. Solo el 413 toma la rama http-errors.
  - Cambio: en la matriz unitaria, el caso `entity.parse.failed` pasa a ser `new BadRequestException(...)`.
  - Cambio: la e2e 6 y TC-HEALTH-04 solo verifican el estado 400, la cabecera y que no haya línea ERROR, sin forma de cuerpo.
- **[Escéptico] Un `statusCode` en string rompe el filtro.** Con `{statusCode:'400'}`, `ExpressAdapter.reply` llama a `res.status('400')`, y Express 5 lanza TypeError (`response.js:64-68`).
  - Cambio: se delega solo si `Number.isInteger(statusCode) && 400 <= statusCode < 500`. Lo demás va al 500 genérico.
  - Cambio: se elimina la frase "la prueba fija lo que se observe".
- **[Escéptico] Precondición de OpenSpec.** Hay que archivar `openspec/changes/upgrade-dev-tooling` (PR #39 ya fusionado) antes de abrir este cambio.
- **[Escéptico] Logger.** `design.md` debe aclarar que el diseño supone el ConsoleLogger síncrono de Nest. Un logger asíncrono futuro, como pino, necesitaría `useProcessExit`.
- **[Escéptico] Redacción y pruebas.**
  - El punto de inserción es justo después de la sentencia `NestFactory.create(...)`, no "después de la línea 15".
  - En la e2e 7, el mock lento debe limpiar su timer.
  - Las aserciones de cierre de la e2e 8 se mueven a un `it` propio en lugar de `afterAll`.
  - El health check de Seenode se mantiene en `/api/health`, y la nota va también en la tabla §1 del runbook.

**Pendientes del evaluador (ronda 3)**

- Hay una contradicción entre el diseño y la spec. `BaseExceptionFilter.handleUnknownError` registra en ERROR todo lo que no es HttpException, incluido el 413. Hay que responder los 4xx http-errors directamente con `httpAdapter.reply`, sin `super.catch()`, o reformular el requisito.
- La rama del 500 genérico debe copiar el chequeo `isHeadersSent` de Nest.
- Hay que demostrar "exactamente una línea ERROR" también cuando el error viene de un middleware Express, y verificar que ExceptionsHandler no registre nada.
- Hay que nombrar el ID concreto del TC-UI. La tabla está desordenada en las líneas 3179-3181.
- Hay que aclarar si la ruta de respaldo del filtro pone `X-Request-Id` en todas las ramas.
- Conviene revisar el nivel `warn` para 401 y 404, que generan ruido en los Logs de Seenode.
- Falta un plan alternativo si `req.route` está vacío al cerrar la respuesta en Express 5. Por ejemplo, un interceptor que escriba `req.routeTemplate`.

**Pruebas:** matriz unitaria del filtro y de las funciones puras; suite A (8 e2e, con el cupo de login contado: 2 de 5); suite B aislada para el 429; un journey de Playwright que muestra el requestId en la alerta de validaciones; QA manual de base caída, Swagger en producción y señales.

**Dependencias:** sin paquetes nuevos y sin migración. Conviene fusionarlo antes del primer despliegue. El dueño debe cambiar el Start Command y crear un monitor externo gratuito sobre `/api/health/db`.

---

### 4.2 `participant-data-privacy`: ranking y detalle de reto sin emails ni pagos ajenos

- **Capacidades:** deltas en `challenge-lifecycle`, `challenge-scoring` y `challenge-finance`; casos QA TC-SEC-06 a TC-SEC-11.
- **Versión objetivo:** 1.4.2, parche de seguridad sin migración. Se etiqueta antes del primer despliegue.
- **Esfuerzo:** M, de 3,5 a 4 días.
- **Puntaje final:** 8,0 (rondas: 8 → 8,5 → 8). Es el más alto entre los finalistas.
- **Estado:** sobrevive (objeciones menores).

**Por qué (8 fugas verificadas)**

| # | Fuga |
|---|---|
| 1-3 | `GET /challenges/:id/results` devuelve `email` y `paid` en el ranking y el email en `awards`, a cualquier rol. La web pinta el email de todos. |
| 4 (la más grave) | `GET /challenges/active/list` devuelve filas completas de `ChallengeParticipant` (`paid`, `amountPaid`, `paymentProofUrl`, `paymentProofCloudinaryId`...) y `user.email` a cualquier rol. |
| 5-6 | `GET /challenges/active` y `GET /challenges/:id` tienen el mismo problema. |
| 7 | Cualquier participante puede leer `/participants`, con email, rol y estado activo. |
| 8 | Cualquier usuario autenticado puede abrir el detalle de cualquier actividad: fotos, frecuencia cardíaca y email del dueño. |

Como quien no pagó puede ganar, exponer `paid` deja en evidencia a esa persona, y la URL de producción será pública.

**Qué cambia**

1. **`active/list`, `active` y `:id`.**
   - Agregan siempre `me`: los datos de inscripción de quien llama, o `null`. Usa la lista blanca `{paid, paidAt, amountPaid, paymentProofUrl, paymentProofUploadedAt, joinedAt}` y nunca incluye `paymentProofCloudinaryId`.
   - Para PARTICIPANT se elimina la clave `participants` (D1).
   - El ADMIN recibe todo lo de hoy más `me`.
   - `isParticipant` se conserva, porque `pickDefaultChallenge` lo usa.
2. **`results` para PARTICIPANT.**
   - Las filas de `ranking`, `tiedAtTop` y `winners` usan 8 claves en lista blanca, y las de `awards`, 4 claves.
   - El resto del nivel superior pasa intacto, incluido `payout`.
3. **`/participants`:** solo admin.
4. **`GET /activities/:id`:** solo el dueño o el admin. Un tercero recibe 403 "No puedes ver esta actividad"; un id inexistente da 404.
5. **Frontend.**
   - El email en el ranking solo se muestra al ADMIN.
   - El dashboard lee `challenge.me ?? challenge.participants?.find(...)`. El fallback D6 se quita en 1.5.0.
6. **Diseño.** La proyección vive en el controlador y usa funciones puras tipadas en `privacy.ts`, sin cambios en los servicios.
7. **Despliegue.** Hay una ventana de unos minutos con la web 1.4.1 y la API 1.4.2: el participante no ve su estado de pago, pero nada se rompe. Es aceptable y ocurre sin usuarios reales.
8. **Pruebas y QA.**
   - Unitarias de la lista blanca y del conjunto de claves.
   - Un bloque en `platform-rules.e2e-spec.ts`.
   - `e2e/tests/11-privacy.spec.ts`, sin logins nuevos y con `selectChallenge` en cada prueba de UI.
   - Capturas de la guía regeneradas.
   - Seis casos TC-SEC en `catalog.mjs`, con `test-cases.md` regenerado.

**Correcciones de los escépticos**

- **[Escéptico] Tipado.** `pick(own, OWN_FIELDS)` sobre el tipo genérico `C['participants'][number]` probablemente no compila con `strict`. El plan B pasa a ser el principal: exportar `participantsInclude` con `satisfies Prisma.ChallengeInclude` y `Prisma.ChallengeGetPayload`, o tipar `own` contra el tipo base no genérico. Esto además elimina el `include` duplicado del servicio.
- **[Escéptico] Cifras del catálogo QA.** El total queda en "110 casos · 110 aprobados · 109 automatizados", no "110 automatizados", porque hoy son 103 de 104.
- **[Escéptico] Fuera de alcance.** Se agrega `GET /challenges` (findAll): no tiene `@Roles` y devuelve retos DRAFT, pero solo con `_count`.
- **[Escéptico] Swagger.** Se agregan `@ApiResponse(403)` y resúmenes actualizados en `/participants` y en `GET /activities/:id`.
- **[Escéptico] Cobertura e2e.** También hay que verificar que `GET /challenges/active` con el token de Ana no traiga `participants`.
- **[Escéptico] Opcional.** Reducir el `challenge: true` del detalle de actividad del dueño, o dejar registrado que son sus propios datos.

**Pendientes del evaluador**

- La sección 6 se construye sobre una ventana que no existe en el primer despliegue. Conviene quitar D6 y la nota del runbook, o justificarlos como patrón general. La afirmación sobre la ventana inversa debe citar `runbook-despliegue.md:140`, donde Seenode despliega ambos servicios a la vez; ese caso es la verdadera justificación de D6.
- El tercer login de contingencia choca con el throttle de 5 por minuto, sumando los logins de UI de `01-auth-navigation` y `07-theme`. Hay que comprometerse con la vía de import o declarar el presupuesto de logins.
- Hay que cumplir la promesa de tipos de retorno explícitos en el controlador, o retirarla.
- `ApiTokens` también expone `adminId` y `participantId`: conviene usar `participantId`.
- El CHANGELOG 1.4.2 debe advertir el cambio de contrato de la API.
- La sección 0 (reflexión sobre el borrador) no va en `proposal.md`.
- Hay que justificar en qué spec va el requisito del detalle de actividad.
- Hay que declarar que la forma de la respuesta de actividad no cambia para el dueño y el admin.
- Riesgo residual que falta listar: `POST /upload/sign` permite firmar subidas a cualquier carpeta, incluida `payments/*`. Lo cubre `upload-guardrails`.

**Dependencias:** ninguna. Riesgos residuales aceptados:
- Del `payout` público, que es una decisión cerrada, se puede deducir en grupos chicos quién falta por pagar.
- Las URLs de Cloudinary siguen siendo públicas para quien ya las tenga.

---

### 4.3 `closed-challenge-freeze`: congelar el reto COMPLETED con un sorteo justo y guardado (con el cierre asistido como cambio aparte)

- **Capacidades:** `challenge-lifecycle`, `challenge-scoring`, `activity-withdrawal` y `google-sheets-import`.
- **Esfuerzo:** cambio A (solo backend), de 3 a 3,5 días. Cambio B (cierre asistido), de 2 a 2,5 días, o de 1 a 1,5 en la variante recortada. Total de 5 a 6 días.
- **Puntaje final:** 7,5 (rondas: 6,5 → 8 → 7,5).
- **Estado:** sobrevive (objeciones menores).

**Por qué**

1. `validate`, `reject` y `remove` nunca miran `challenge.status`. Así se puede alterar el ranking de un reto cuyo premio ya se repartió.
2. La importación, por archivo o por Sheets, escribe en retos cerrados.
3. El sorteo usa `sort(() => Math.random() - 0.5)` (`scoring.ts:76-78`): está sesgado, no se guarda y cambia de ganadores en cada GET.
4. Hay tres vías de cierre (`POST /close`, `PATCH status` y `award()`) sin núcleo común. Hoy se puede cerrar un DRAFT, y la UI solo pide un `confirm()`.
5. Después del cierre no hay forma de corregir desde la web, así que la revisión tiene que ocurrir antes.

**Qué cambia**

**Cambio A, incremento 1: congelar.**
- `lockOpenChallenge` / `withChallengeLock` toma `FOR SHARE` sobre la fila del reto con `lock_timeout = 5s`, y traduce los errores P2028 y 55P03 a 409 "El reto se está cerrando; vuelve a intentarlo en unos segundos".
- Lo usan todas las escrituras que dependen del estado: crear, validar, rechazar y eliminar actividades; añadir y quitar participantes; `markPayment`; `uploadPaymentProof`; y la importación fila por fila.
- La actividad se vuelve a leer bajo el lock.
- Mensajes: "El reto está cerrado; sus actividades son definitivas" y "El reto M/AAAA está cerrado; no se pueden importar actividades".

**Cambio A, incremento 2: núcleo de cierre y sorteo.**
- Fisher-Yates con `crypto.randomInt`.
- `closeTx` con `FOR UPDATE` es el único camino de cierre. Solo se cierra un reto ACTIVE.
- Si hace falta sorteo, los ganadores se guardan como `ChallengeAward` con la nota reservada "Sorteo automático al cierre", sin migración. El DTO rechaza esa nota.
- `PATCH` con COMPLETED y otros campos responde 400.
- La premiación posterior reemplaza las awards automáticas.

**Cambio B, incremento 3: cierre asistido.**
- `GET /challenges/:id/close-preview` (solo admin): actividades pendientes, comprobantes por revisar, impagos, sorteo previsto con cupos y reparto proyectado.
- Modal `CloseChallengeDialog` en "Cerrar reto" y en "Guardar premiación". Si hay pendientes, el botón queda bloqueado hasta marcar una casilla. Los impagos solo informan, porque quien no pagó puede ganar.

**Correcciones de los escépticos**

- **[Escéptico, señalado por los dos escépticos] Carrera en el PATCH de reglas.** `update()` lee el estado fuera de la transacción y escribe sin condición. Un PATCH de `pointsPerKm` que se intercala con el cierre cambia el puntaje después del sorteo guardado.
  - Cambio: serializar `update()` (y `activate`) con un lock o con `updateMany where status != COMPLETED`, y devolver 400 si `count = 0`.
  - Cambio: agregar el escenario a la spec y dejar de decir que PATCH está "ya bloqueado".
- **[Escéptico] Participantes en `award()`.** La verificación de participantes queda fuera del lock. Se mueve dentro de `closeTx`, después de `FOR UPDATE`.
- **[Escéptico] Timeout en `closeTx`.** Se agrega `SET LOCAL lock_timeout` (por ejemplo, 10 s) dentro de `closeTx`.
- **[Escéptico] Usuarios huérfanos en la importación.** En `applyRow`, verificar el estado (sin lock) antes de crear el usuario, para que las filas de un reto cerrado no creen cuentas. Hoy se cuentan en `usersCreated` aunque la fila termine en `errors`.
- **[Escéptico] "Otros campos" en `update()`.** Se definen con el predicado `onlyClosing`, que ignora los valores `undefined`. Va con su prueba unitaria.
- **[Escéptico] Pruebas faltantes en `backend/test/`.** Agregar los casos de congelamiento, sorteo y cierre de DRAFT a `platform-rules.e2e-spec.ts` y `challenge-lifecycle.e2e-spec.ts`, y una fila de reto cerrado a `import-sheet.e2e-spec.ts`.
- **[Escéptico] Fase 7 de la guía, "Cargar el historial".** El orden explícito pasa a ser crear, activar, importar y registrar la premiación real con "Guardar premiación" sobre el reto ACTIVE. Si no, el cierre hace un sorteo automático sobre los ganadores históricos. Se agrega un caso QA.
- **[Escéptico] Delta de challenge-scoring.** Debe aclarar que los escenarios de sorteo actuales describen un reto no cerrado, y que un reto cerrado con sorteo guardado reporta `drawNeeded = false`.
- **[Escéptico] Errores en el modal.** `CloseChallengeDialog` debe mostrar el mensaje de la API para los 400 y los 409, como exige la spec en la línea 130.
- **[Escéptico] Esfuerzo.** El incremento 1 sube a entre 2 y 2,5 días por la reescritura de mocks para transacciones interactivas.

**Pendientes del evaluador**

- El MODIFIED de "Closed challenges are final" debe traer el texto completo de reemplazo con SHALL/MUST.
- Hay que definir si `guaranteed`, `drawPool` y `drawSeats` llegan al `GET /results` público o solo a un tipo interno.
- Falta una prueba determinista del 409: retener `FOR UPDATE` más de 5 s desde otra conexión. La prueba de carrera con 10 pares en paralelo no es determinista y debería etiquetarse como prueba de humo.
- Hay que inventariar los cambios de comportamiento para quienes ya llaman a la API: `award()` sobre un DRAFT ahora da 400, y validar de nuevo en un reto cerrado pasa de no-op a 400. Va con una nota en el CHANGELOG.
- Cambio B: el preview corre sin lock. El cierre siempre recalcula, así que la UI debe mostrar los resultados devueltos tras cerrar, o usar una huella del preview con 409 si no coincide.
- Hay que considerar partir el incremento 1 en dos PR: actividades e importación por un lado, participantes y pagos por otro.

**Dependencias:** se apoya en 1.4.1. No depende de Seenode ni de Cloudinary, no tiene migración y no bloquea el despliegue. B depende de A.

---

### 4.4 `upload-guardrails`: firma restringida por reto, usuario y propósito, validación de evidencias y limpieza de huérfanos

- **Capacidad:** `upload-guardrails`, nueva. Deltas en `challenge-finance` (tramo A) y `activity-withdrawal` (tramo B).
- **Esfuerzo:** tramo A, que bloquea el despliegue (1.5.0): de 2,5 a 3 días más media jornada de verificación con la cuenta real. Tramo B, de seguimiento (1.6.0): de 1,5 a 2 días.
- **Puntaje final:** 7,5 (rondas: 7 → 8 → 7,5).
- **Estado:** sobrevive (objeciones menores).

**Por qué**

1. La firma solo cubre `{folder, timestamp}`, sin `allowed_formats`.
2. El cliente elige la carpeta y el `resourceType`, y basta con tener sesión. Como el registro es público, cualquiera gasta la cuota del dueño desde el primer día.
3. Las evidencias aceptan URLs de cualquier host.
4. `markPayment` acepta la URL y el id del comprobante por separado. `uploadPaymentProof` no verifica que el usuario participe en el reto.
5. `deleteAsset` nunca se llama y, en modo local, no borra nada.
6. El frontend agrupa los archivos por mes, lo que no encaja con varios retos activos.
7. El limitador depende de que `TRUST_PROXY` esté bien configurado.

**Qué cambia: tramo A (1.5.0)**

- **Firma.** El body pasa a ser `{challengeId, purpose: 'activity' | 'payment-proof'}`.
  - El servidor deriva la carpeta como `<base>/<challengeId>/<sub>/<purpose>`.
  - Se firman `allowed_formats`, `folder` y `timestamp`. Los formatos son `heic,jpg,png,webp` para actividades, y lo mismo más `pdf` para comprobantes.
- **Solo firma un participante.** Para `activity`, el reto debe estar ACTIVE; para `payment-proof`, no puede estar COMPLETED. Un admin que no participa recibe 403.
- **Validación de evidencias (R2).** La URL debe corresponder exactamente al `publicId`, y el id debe estar bajo la carpeta propia del usuario. En `markPayment`, la URL y el id llegan juntos o no llegan. La importación no cambia.
- **Simulador local honesto.** Valida carpeta, usuario, participación, formato y tamaño, con un 413 en español.
- **Throttle de firma** (30 por minuto).
- **Frontend.** Nueva firma de `uploadToCloudinary`, `accept` alineados con los formatos y mensajes en español.
- **Runbook.**
  - Activar "Allow delivery of PDF and ZIP files" en la cuenta.
  - Revisar `TRUST_PROXY`.
  - Pruebas de humo por formato.
- **Fixtures.** Se actualizan las fixtures de prueba (§7.4).
- **Verificación manual con la cuenta real (V1 a V5).** El gate V3 decide sobre el PDF. Su plan B es quitar el PDF del comprobante; no se usa `raw`.

**Qué cambia: tramo B (1.6.0)**

- `deleteAsset` con contrato explícito: devuelve `'deleted'` o `'not_found'`, o lanza el error. Se corrige el modo local.
- `deleteAssetsLater`: borrado best-effort con chequeo de referencias compartidas.
- Limpieza en `activities.remove`.
- Los comprobantes reemplazados solo se borran con `UPLOAD_DELETE_REPLACED_PROOFS=true`, tras la aprobación del dueño (T0).
- Script de solo lectura `scripts/cloudinary-orphans.mjs` y un paso de mantenimiento mensual en el runbook.

**Correcciones de los escépticos**

- **[Escéptico, señalado por los dos escépticos] El throttle es incompatible con las pruebas.** `@Throttle({default:{limit:30}})` en la ruta ignora `THROTTLE_LIMIT`, y Playwright depende de `THROTTLE_LIMIT=2000` (`playwright.config.ts:64`). Además, las apps e2e no configuran `trust proxy`, así que se ignora `X-Forwarded-For`.
  - Cambio: hacer el límite configurable (`UPLOAD_SIGN_LIMIT`, 30 por defecto) y subirlo en Playwright y en el entorno de la e2e de API.
  - Cambio: probar el 429 en una instancia de app propia o al final del archivo.
- **[Escéptico] Infraestructura de e2e.** No existe un setup de Jest e2e. Hay que crear `backend/test/setup-e2e.ts`, registrarlo en `setupFiles` y fijar `CLOUDINARY_*=''` y `PUBLIC_URL` antes de compilar `AppModule`. Va con una aserción de modo local.
- **[Escéptico] Constructores en las specs unitarias.** Faltan en el inventario: `activities.service.spec.ts:54` y unas 10 instancias en `challenges.service.spec.ts` rompen al agregar `UploadService` al constructor. Hay que sumarlas a §7.4 y al estimado.
- **[Escéptico] Comprobante subido por el admin.** La spec debe aclarar que el admin no puede subir un comprobante por un participante: solo puede reenviar uno que ya esté en la carpeta del participante. La alternativa es quitar los campos del DTO.
- **[Escéptico] Grafo de módulos.** `UploadModule` debe reexportar `UploadCoreModule`, o `app.module.ts` debe seguir importándolo, para que el grafo quede consistente.
- **[Escéptico] Requisito sin escenario.** El requisito del tramo B "Replaced proofs are kept..." no tiene escenario. Hay que agregarlo y correr `openspec validate --strict`.
- **[Escéptico] Dynamic folder mode.** V5 debe verificar que el `public_id` real empiece con la carpeta derivada, porque las cuentas nuevas usan dynamic folder mode. Si no empieza así, la alternativa es `asset_folder` con `public_id_prefix`.
- **[Escéptico] Regex.** Escapar `base` y `cloudName` en las regex y normalizar las barras de `CLOUDINARY_FOLDER`.
- **[Escéptico] Calendario del dueño.** V1 a V5 pasan a ser un gate del primer despliegue en la cuenta del dueño, y hay que agendarlos junto a la configuración de Seenode en el runbook.

**Pendientes del evaluador**

- **El inventario sigue incompleto.**
  - `e2e/guide/capture.spec.ts:155` envía un comprobante con `placehold.co`, que rompe con R2. Requiere una subida real por `/upload/local`.
  - `parallel-session-test.mjs:328-329` y `:342` también usan ids ajenos.
  - Conviene un grep final como gate (`example.com|placehold.co|cloudinaryId:`).
- **Operación de spec.** "Payments close with the challenge" ya cubre los comprobantes. Hay que decidir si los requisitos nuevos son MODIFIED y no ADDED.
- **Modo local.** Hay que fijar el invariante de la carpeta saneada frente al `publicId`, y comparar contra el origin más el prefijo de path de `PUBLIC_URL`.
- **Tipos de foto.** `HEART_RATE` y `METRICS` se tratan como `activity`. Hay que declararlo y probar que una foto `HEART_RATE` se acepta, por consistencia con la regla de minutos de FC.
- **Alcance.** El tramo A es grande para algo que bloquea el despliegue. Conviene evaluar un **A0 mínimo**: carpeta derivada por el servidor, `allowed_formats` firmado, chequeo de participante y validación de prefijo. El simulador honesto y la experiencia de HEIC y PDF quedarían para después.
- **Plan B de V3.** Quitar el PDF del comprobante cambia lo que ve el usuario. Necesita un dueño de la decisión y el texto alternativo de spec y de guía ya escrito.
- **Proceso.** Quitar la sección 0 y los puntajes de los jueces del `proposal.md`.
- **Documentación.** Actualizar `docs/guia-plataforma.html` y `docs/challenge-rules.md` con los formatos y los mensajes nuevos.

**Dependencias:** necesita la cuenta de Cloudinary del dueño para cerrar el tramo A. T0 solo bloquea la activación del flag. Sin migración y sin paquetes nuevos.

---

## 5. Roadmap sugerido

### Antes del primer despliegue

0. **Archivar** `openspec/changes/upgrade-dev-tooling`, porque el PR #39 ya está fusionado. Así queda un solo cambio abierto a la vez.
1. **`participant-data-privacy` → 1.4.2.** No tiene dependencias y es la fuga más grave. Su ventana de despliegue ocurre sin usuarios.
2. **`ops-observability-baseline`.** Readiness 503, Swagger apagado, requestId y `exec` en el Start Command.
3. **`upload-guardrails`, tramo A** (o el A0 mínimo si el tiempo aprieta), con V1 a V5 sobre la cuenta real de Cloudinary.
4. **En paralelo, el dueño:** crea las cuentas de Seenode y Cloudinary, cambia el Start Command, crea el monitor externo sobre `/api/health/db`, activa la entrega de PDF y revisa `TRUST_PROXY`.
5. **Opcional y barato:** el incremento 1 de `participant-profile-history` (pantalla de cambio de contraseña). Cubre la rotación de la contraseña del admin semilla en producción y es solo frontend.

**Conflictos de coordinación que hay que resolver antes de empezar** (detectados al cruzar las propuestas):
- **Versión.** `ops-observability-baseline`, el tramo A de `upload-guardrails` y `closed-challenge-freeze` apuntan a 1.5.0. Si los dos primeros salen antes del despliegue, conviene empaquetarlos juntos en 1.5.0 y mover el congelamiento a 1.6.0. El tramo B de upload, previsto para 1.6.0, se correría en consecuencia.
- **IDs del catálogo QA.** `ops-observability-baseline` reserva TC-SEC-06 y TC-SEC-07, y `participant-data-privacy` reserva TC-SEC-06 a TC-SEC-11. Hay que renumerar según el orden de merge.
- **Nombre de spec e2e.** `11-privacy.spec.ts` y `11-close-freeze.spec.ts` comparten el número 11.
- **Archivos compartidos.** `privacy`, `upload-guardrails` y `freeze` tocan `ChallengesService` (`markPayment`, `uploadPaymentProof`, el constructor), `activities.service.ts` y las fixtures de e2e. Conviene fusionarlos en serie y rebasar.
- **Errores 409.** El 409 de `freeze` (`isLockTimeout`) convive con el filtro global de `ops`. Hay que verificar que el filtro deje pasar las `ConflictException` sin cambios, lo que ya ocurre por la rama de menos de 500.

### Justo después del despliegue

6. **`closed-challenge-freeze`, cambio A** (congelar, luego núcleo de cierre y sorteo guardado). Debe estar listo antes del primer cierre real de mes con premio.
7. **`closed-challenge-freeze`, cambio B** (cierre asistido, o la variante recortada).
8. **`upload-guardrails`, tramo B** (limpieza y script de huérfanos). El flag de borrado de comprobantes se activa solo tras T0.
9. **`challenge-export-csv`.** Es un acta y respaldo liviano barato, útil si el plan de Seenode no ofrece backups.

### Más adelante

10. **`payment-reconciliation`.** Depende del objeto `me` de privacidad. El checklist del cambio B de `freeze` ya cubre el riesgo de comprobantes olvidados.
11. **`resubmit-rejected-activity`.** El incremento 1 (borrar una actividad REJECTED) es barato. El incremento 2 necesita migración y depende de `upload-guardrails`.
12. **`participant-my-month-calendar`.** Primero lo barato: el CTA de día de descanso y las pistas del selector de fecha. La grilla completa, después.
13. **`enrollment-at-scale-renewal`.** Duplicar el reto e inscribir en bloque. El código de invitación se posterga.
14. **`admin-user-management`.** Reset por admin y chequeo de usuario activo en el JWT. La migración del incremento 3 va al final.
15. **`participant-profile-history`.** El historial entre retos.
16. **`multi-challenge-operations`.** El incremento 1 se puede hacer en cualquier momento. Quitar `@@unique([month, year])` solo cuando exista de verdad un segundo grupo.

### Dependencias entre propuestas

| Propuesta | Depende de / se relaciona con |
|---|---|
| `payment-reconciliation` | `participant-data-privacy` (objeto `me`) |
| `resubmit-rejected-activity`, incremento 2 | `upload-guardrails` (reemplazo de foto con limpieza en Cloudinary) |
| `closed-challenge-freeze` B | `closed-challenge-freeze` A (`closeTx`, `guaranteed`/`drawPool`) |
| `upload-guardrails` B | `upload-guardrails` A |
| `participant-data-privacy` | Riesgo residual de `/upload/sign` sobre `payments/*`, que cierra `upload-guardrails` A |
| `participant-profile-history`, incremento 1 | Absorbe la página "Mi cuenta" de las propuestas de admin y de ops |

## 6. Ideas descartadas y por qué

- **Centro de avisos dentro de la app** (tabla Notification, campana, polling cada 60 s). Necesita un modelo nuevo, migración y escrituras en todos los servicios; es demasiado para el MVP mientras el despliegue está pendiente. Lo que no requiere cron se conservó: el banner "hoy no registraste" pasó al calendario, y el contador de comprobantes por revisar pasó a conciliación.
- **Agregar `paymentProofUploadedAt` con migración.** El campo ya existe (`schema.prisma:97`).
- **Guard de COMPLETED en `ActivitiesService.create`.** Ya existe: `create` lanza "El reto no está activo".
- **Columna `drawSeed` con un shuffle determinista.** Se prefirió la variante del admin: Fisher-Yates criptográfico una sola vez al cierre, guardado como `ChallengeAward`, sin migración y respetando la precedencia de la premiación presencial.
- **Recuperación de contraseña por email.** Necesita un proveedor de correo y secretos nuevos antes del despliegue. Por ahora la cubren las contraseñas temporales que emite el admin.
- **Bonos de racha en el puntaje.** `docs/challenge-rules.md:121` los excluye. Las rachas quedan solo para mostrar.
- **Copiar `paid` o `amountPaid` al duplicar un reto o copiar inscritos.** Contradice que el pote es lo que los participantes realmente pagaron. Las copias empiezan siempre con `paid = false`.
- **Fusiones de duplicados** (no son descartes de fondo):
  - Administración de usuarios: las versiones de admin y de ops se unieron en `admin-user-management`.
  - Congelamiento: las versiones de admin y de ops se unieron en `closed-challenge-freeze`.
  - Corregir un día rechazado: las versiones de participante y de crecimiento se unieron en `resubmit-rejected-activity`.
  - Perfil e historial: las versiones de participante y de crecimiento se unieron en `participant-profile-history`.
  - Estado de pago: las ideas de conciliación del admin y de estado del participante se unieron en `payment-reconciliation`.
  - Renovación mensual (crecimiento) e inscripción a escala (admin) se unieron en `enrollment-at-scale-renewal`.
  - Retos paralelos en el mismo mes (crecimiento) y cola de validación por reto (admin) se unieron en `multi-challenge-operations`. Quitar el único por mes apoya la decisión de varios retos activos; no la contradice.