# Casos de prueba — Reto de Constancia

Casos de prueba funcionales paso a paso para todos los flujos de la app.
Cubren backend (API) y frontend (UI), con datos concretos del seed local.

## Entorno y datos de prueba

| Recurso | Valor |
|---|---|
| Frontend | http://localhost:3005 |
| API | http://localhost:3002/api |
| Swagger | http://localhost:3002/api/docs |
| Admin | `admin@reto.local` / `ChangeMe123!` |
| Participantes | `ana@reto.local`, `bruno@`, `carla@`, `diego@`, `elena@reto.local` / `ChangeMe123!` |
| Reto activo (seed) | "Reto Mayo 2026" (01–31 may, días válidos Lun–Sáb) |

**Preparar/reiniciar datos:**
```bash
# 1) Postgres
docker start reto-constancia-db
# 2) Datos de demo (admin + reto activo + 5 participantes con actividades)
cd backend && npm run prisma:seed
# 3) Servidores
cd backend && npm run start:dev      # API en :3002
cd frontend && npm run dev           # UI en :3005
```

**Cobertura automatizada (referencia):**
- Unit: `backend/src/**/*.spec.ts` → `cd backend && npm test`
- E2E API: `backend/test/app.e2e-spec.ts` → `npm run test:e2e` (requiere Postgres)
- Sesiones paralelas / integración: `scripts/parallel-session-test.mjs` →
  `node scripts/parallel-session-test.mjs` (23 checks)

Convención de cada caso: **ID · Objetivo · Precondición · Pasos · Resultado esperado**.

---

## 1. Autenticación y cuentas

### TC-AUTH-01 · Registro de participante (happy path)
- **Precondición:** email no registrado.
- **Pasos:**
  1. UI: ir a http://localhost:3005/register.
  2. Nombre "Test User", email `test1@reto.local`, password `Passw0rd1`.
  3. Enviar.
- **Esperado:** 201; sesión iniciada; redirección a `/dashboard`; rol `PARTICIPANT`.

### TC-AUTH-02 · Política de contraseña (OWASP)
- **Pasos:** registrar con password `corta` (sin número / < 8).
- **Esperado:** 400; mensaje "mínimo 8 caracteres, con al menos una letra y un número". No se crea el usuario.

### TC-AUTH-03 · Email duplicado
- **Pasos:** registrar con `ana@reto.local`.
- **Esperado:** 409 "Email ya registrado".

### TC-AUTH-04 · Login correcto
- **Pasos:** login `admin@reto.local` / `ChangeMe123!`.
- **Esperado:** 200; respuesta `{ user, tokens:{ accessToken, refreshToken } }`; `user.role = ADMIN`.

### TC-AUTH-05 · Login con password incorrecto
- **Pasos:** login `ana@reto.local` / `wrong`.
- **Esperado:** 401 "Credenciales inválidas" (mensaje genérico, no revela si el email existe).

### TC-AUTH-06 · Perfil autenticado
- **Pasos:** `GET /auth/me` con `Authorization: Bearer <accessToken>`.
- **Esperado:** 200; perfil sin `passwordHash`.

### TC-AUTH-07 · Acceso sin token
- **Pasos:** `GET /auth/me` sin header.
- **Esperado:** 401.

### TC-AUTH-08 · Refresh token
- **Pasos:** `POST /auth/refresh` con `{ refreshToken }` válido.
- **Esperado:** 200; nuevos `accessToken` y `refreshToken`.

### TC-AUTH-09 · Rate limiting anti fuerza bruta
- **Pasos:** 6 logins seguidos con password incorrecto desde la misma IP en < 1 min.
- **Esperado:** los primeros 5 → 401; el 6º → 429 (Too Many Requests).

### TC-AUTH-10 · Token expirado → auto-refresh (UI)
- **Precondición:** sesión iniciada en UI.
- **Pasos:** esperar expiración del access token (15m) y navegar.
- **Esperado:** el cliente renueva con el refresh token de forma transparente; si el refresh falla, redirige a `/login`.

---

## 2. Gestión de retos (admin)

### TC-CHAL-01 · Crear reto con reglas propias
- **Precondición:** login admin.
- **Pasos:** `POST /challenges` con name, month, year, start/end, `validDays:[1..6]`, `feePerParticipant`, `currency`.
  (UI: Dashboard → Retos → crear.)
- **Esperado:** 201; reto en estado `DRAFT`.

### TC-CHAL-02 · Reto duplicado por mes/año
- **Pasos:** crear otro reto con `month=5, year=2026`.
- **Esperado:** 409 "Ya existe un reto para 5/2026".

### TC-CHAL-03 · Validación de fechas
- **Pasos:** crear reto con `startDate >= endDate`.
- **Esperado:** 400 "startDate debe ser menor que endDate".

### TC-CHAL-04 · Activar / cerrar reto
- **Pasos:** `POST /challenges/:id/activate`, luego `POST /challenges/:id/close`.
- **Esperado:** status pasa a `ACTIVE` y luego `COMPLETED`. Reactivar un `ACTIVE` responde igual (idempotente). Activar un `COMPLETED` → 400 (también vía `PATCH { status: "ACTIVE" }`). Participante → 403.
- *(Automatizado en `backend/test/challenge-lifecycle.e2e-spec.ts` y `challenges.service.spec.ts`.)*

### TC-CHAL-05 · Editar reglas
- **Pasos:** `PATCH /challenges/:id` cambiando `validDays`, `feePerParticipant`, `prizeDescription`.
- **Esperado:** 200; cambios persistidos.

### TC-CHAL-06 · Reto activo por defecto
- **Pasos:** con 2 retos `ACTIVE` (A más antiguo, B más reciente) y el usuario inscrito solo en A: `GET /challenges/active` como ese usuario y como un usuario sin inscripción.
- **Esperado:** el inscrito recibe A; el no inscrito recibe B; sin activos → `null`. Siempre incluye `participants`.

### TC-CHAL-08 · Múltiples retos activos a la vez
- **Pasos:** con A `ACTIVE`, activar B; `GET /challenges/active/list` como usuario inscrito solo en A; cerrar A.
- **Esperado:** B pasa a `ACTIVE` y A sigue `ACTIVE`; la lista es `[B, A]` con `isParticipant` `[false, true]`; al cerrar A la lista queda `[B]`.
- *(Automatizado en `challenge-lifecycle.e2e-spec.ts` y `parallel-session-test.mjs` sección 8.)*

### TC-CHAL-09 · Actividades independientes por reto
- **Pasos:** usuario inscrito en A y B (fechas solapadas) registra la misma fecha en A y en B; repite en A.
- **Esperado:** 201 y 201; el duplicado en A → 409; cada ranking cuenta solo sus propias actividades (`topScore` 1 en cada uno).

### TC-CHAL-10 · Selector de reto en la web
- **Pasos:** con un solo reto activo abrir el dashboard; luego activar un segundo reto y recargar; cambiar el reto en el selector del encabezado; recargar; cerrar el reto seleccionado y recargar.
- **Esperado:** con uno no hay selector; con dos aparece y por defecto muestra el reto donde participa el usuario (los no inscritos se marcan "(no inscrito)"); al cambiar, "Mi reto", "Subir actividad" y "Ranking" muestran datos del reto elegido y la elección sobrevive la recarga; al cerrarlo vuelve al reto por defecto.

### TC-CHAL-07 · Múltiples retos con reglas distintas
- **Pasos:** crear un 2º reto (otro mes) con `validDays:[0,6]`, `minHeartRateMinutes:30`, `currency:USD`.
- **Esperado:** 201; `GET /challenges` lista ambos; el detalle conserva las reglas propias de cada uno.
- *(Automatizado en `parallel-session-test.mjs`, sección 7.)*

---

## 3. Participantes y pagos

### TC-PART-01 · Agregar participante (admin)
- **Pasos:** `POST /challenges/:id/participants` con `{ userId }`.
- **Esperado:** 201; participante asociado.

### TC-PART-02 · Participante duplicado
- **Pasos:** agregar el mismo `userId` otra vez.
- **Esperado:** 409 "El usuario ya participa en este reto".

### TC-PART-03 · Quitar participante
- **Pasos:** `DELETE /challenges/:id/participants/:userId`.
- **Esperado:** 204.

### TC-PART-04 · Marcar pago (admin)
- **Pasos:** `PATCH /challenges/:id/participants/:userId/payment` con `{ paid:true, amountPaid:120 }`.
- **Esperado:** 200; `paid=true`, `paidAt` seteado.

### TC-PART-05 · Subir comprobante propio (participante)
- **Precondición:** login participante, ser parte del reto.
- **Pasos:** UI Dashboard → "Subir comprobante" → elegir imagen/PDF.
- **Esperado:** sube el archivo (Cloudinary o simulador local), guarda `paymentProofUrl`; aparece enlace "Ver comprobante cargado".

### TC-PART-06 · No modificar reto cerrado
- **Pasos:** agregar/quitar participante en un reto `COMPLETED`.
- **Esperado:** 400 "No se puede modificar un reto cerrado".

---

## 4. Actividades diarias

### TC-ACT-01 · Registrar actividad (happy path)
- **Precondición:** login participante en reto `ACTIVE`.
- **Pasos:** UI Dashboard → "Subir actividad de hoy"; elegir tipo, duración, distancia, al menos 1 foto; fecha en día válido dentro del período.
- **Esperado:** 201; actividad en `PENDING`.

### TC-ACT-02 · Foto obligatoria
- **Pasos:** crear actividad con `photos: []`.
- **Esperado:** 400 "Al menos una foto/captura es obligatoria".

### TC-ACT-03 · Fecha fuera del período
- **Pasos:** crear actividad con fecha fuera de `[startDate, endDate]`.
- **Esperado:** 400 "La fecha está fuera del período del reto".

### TC-ACT-04 · Día no válido
- **Pasos:** crear actividad en un día de la semana no incluido en `validDays` (ej. domingo si válidos son Lun–Sáb).
- **Esperado:** 400 "Ese día de la semana no es válido para este reto".

### TC-ACT-05 · Una actividad por día
- **Pasos:** crear 2 actividades para la misma fecha/usuario/reto.
- **Esperado:** la 2ª → 409 "Ya registraste una actividad para ese día".

### TC-ACT-06 · No participante no puede registrar
- **Pasos:** usuario que no participa intenta `POST /activities`.
- **Esperado:** 403 "No participas en este reto".

### TC-ACT-07 · Reto no activo
- **Pasos:** registrar actividad en reto `DRAFT`/`COMPLETED`.
- **Esperado:** 400 "El reto no está activo".

### TC-ACT-08 · Validar actividad (admin)
- **Pasos:** UI Dashboard → Validaciones → "Validar"; o `POST /activities/:id/validate`.
- **Esperado:** 200; status `VALIDATED`; `validatedById`/`validatedAt` seteados; cuenta para el ranking.

### TC-ACT-09 · Rechazar actividad (admin)
- **Pasos:** `POST /activities/:id/reject` con `{ reason }`.
- **Esperado:** 200; status `REJECTED`; `rejectionReason` visible para el participante.

### TC-ACT-10 · Mis actividades
- **Pasos:** participante `GET /activities/me`.
- **Esperado:** solo sus actividades.

### TC-ACT-11 · Listado/pending solo admin
- **Pasos:** participante `GET /activities` y `GET /activities/pending`.
- **Esperado:** 403 en ambos.

### TC-ACT-12 · Eliminar actividad
- **Pasos:** participante elimina su actividad `PENDING`; e intenta eliminar una `VALIDATED`.
- **Esperado:** la `PENDING` → 204; la `VALIDATED` → 403 (admin sí puede borrar cualquiera).

### TC-ACT-13 · Regla de FC: registro por debajo del mínimo
- **Precondición:** reto `ACTIVE` con `minHeartRateMinutes = 30`, participante inscrito.
- **Pasos:** `POST /activities` con `heartRateMinutes: 20` y foto `HEART_RATE`.
- **Esperado:** 400; el mensaje menciona `30`; no se crea la actividad. También 400 si falta la foto `HEART_RATE`, si falta `heartRateMinutes`, o si `heartRateMinutes > durationMinutes`.
- *(Automatizado en `backend/test/activity-heart-rate.e2e-spec.ts` y `activities.service.spec.ts`.)*

### TC-ACT-14 · Regla de FC: registro conforme
- **Pasos:** `POST /activities` con `durationMinutes: 45`, `heartRateMinutes: 35`, fotos `ACTIVITY` + `HEART_RATE` (aunque `hasHeartRateProof` venga `false`).
- **Esperado:** 201; `hasHeartRateProof: true` (derivado de las fotos), `heartRateCompliant: true`.

### TC-ACT-15 · Validar actividad no conforme requiere override
- **Precondición:** actividad `PENDING` con `heartRateMinutes` bajo el mínimo o sin captura (p. ej. importada).
- **Pasos:** `POST /activities/:id/validate` sin cuerpo; luego con `{ override: true }`; luego con `{ override: true, note: "..." }`.
- **Esperado:** 400, 400, y finalmente `VALIDATED` con `validationNote` igual a la nota y `heartRateCompliant: false`. Una actividad conforme se valida sin cuerpo y deja `validationNote: null`.
- **UI:** en Validaciones la tarjeta muestra "No cumple FC"; al pulsar Validar pide la nota antes de enviar.

### TC-ACT-16 · Importación con `heartRateMinutes` y advertencias
- **Pasos:** previsualizar un CSV con una fila sin `heartRateMinutes` ni `hasHeartRateProof` para un reto con mínimo 20, y otra conforme.
- **Esperado:** ambas válidas; la primera con `warnings` que mencionan el mínimo; `summary.warnings = 1`; el commit importa ambas. Una fila con `heartRateMinutes > durationMinutes` es error.

### TC-ACT-17 · Reto sin regla de FC
- **Pasos:** crear reto con `minHeartRateMinutes: 0`; registrar una actividad sin `heartRateMinutes` ni captura.
- **Esperado:** 201 en ambos; `heartRateCompliant: true`.

### TC-ACT-18 · Formulario de subida guiado
- **Pasos:** con el reto de diciembre (mínimo 30) seleccionado, ingresar 20 en "Minutos con FC"; luego 30 sin captura; luego 30 con captura.
- **Esperado:** botón deshabilitado con explicación en los dos primeros casos; habilitado en el tercero.

---

## 5. Resultados y premiación

### TC-RES-01 · Ranking y ganador automático
- **Pasos:** `GET /challenges/:id/results`.
- **Esperado:** `ranking` ordenado por días validados (desempate por km); `winners`, `tiedAtTop`, `drawNeeded`, `notes` coherentes.
- *(Validado: Ana lidera con 4 días en el seed.)*

### TC-RES-02 · Empate de 2
- **Precondición:** 2 participantes con igual nº de días validados en el tope.
- **Esperado:** ambos en `winners`; nota "ambas ganan, el presupuesto se divide"; `drawNeeded=false`.

### TC-RES-03 · Empate de 3+ (sorteo)
- **Precondición:** 3+ empatados en el tope.
- **Esperado:** `drawNeeded=true`; `winners` con 2 elegidos; nota de sorteo.

### TC-RES-04 · Premiación manual (admin) prevalece
- **Pasos:** `POST /challenges/:id/awards` con `{ userIds:[...], notes }`.
- **Esperado:** 200; reto pasa a `COMPLETED`; `results.winners` = premiados; nota "Premiación registrada por el administrador".

### TC-RES-05 · Premiar a no participante
- **Pasos:** `award` con un `userId` que no participa.
- **Esperado:** 400 "Solo se puede premiar a participantes del reto".

### TC-FIN-01 · Marcar pago sin monto
- **Pasos:** `PATCH /challenges/:id/participants/:userId/payment` con `{ paid: true }`; luego con `{ paid: true, amountPaid: 60 }`; luego `{ paid: false }`.
- **Esperado:** primero `amountPaid` = cuota del reto y `paidAt` seteado; luego 60; al marcar impago `amountPaid` y `paidAt` quedan `null`.

### TC-FIN-02 · Resumen financiero
- **Precondición:** reto con cuota 120, presupuesto 600 y 5 inscritos: 3 pagaron 120, 1 pagó 60, 1 no pagó.
- **Pasos:** `GET /challenges/:id/finance` como admin.
- **Esperado:** `expectedTotal 600`, `collectedTotal 420`, `pendingTotal 180`, `budgetCovered false`, `budgetDelta -180`, `counts { paid: 3, partial: 1, unpaid: 1 }`, cada participante con su `state`.
- *(Automatizado en `backend/test/challenge-finance.e2e-spec.ts` y `finance.service.spec.ts`.)*

### TC-FIN-03 · Finanzas solo admin
- **Pasos:** `GET /challenges/:id/finance` como participante; y como admin con un id inexistente.
- **Esperado:** 403 y 404.

### TC-FIN-04 · Payout en resultados
- **Pasos:** `GET /challenges/:id/results` con presupuesto 600 y un ganador; con dos empatados; con premiación manual de 3; con presupuesto 0.
- **Esperado:** `payout.perWinner` 600, 300, 200; con presupuesto 0 `monetary false` y `perWinner 0`. El ranking no cambia.

### TC-FIN-05 · UI de finanzas
- **Pasos:** admin abre Participantes; marca/desmarca un pago; participante abre Ranking.
- **Esperado:** tarjetas Esperado / Recaudado / Pendiente / Presupuesto que se actualizan al cambiar pagos; chip `Parcial` con el monto y lo que debe; en Ranking se ve "Premio: X por ganador" (o "Premio no monetario"), marcado como proyectado mientras el reto está activo.

---

## 6. Carga de archivos (Cloudinary / simulador local)

### TC-UP-01 · Firma de subida (auth)
- **Pasos:** `POST /upload/sign` con token y `{ folder, resourceType }`.
- **Esperado:** 200; en local devuelve `{ local:true, uploadUrl:.../api/upload/local }`; con Cloudinary, firma real.

### TC-UP-02 · Subida local (modo dev sin Cloudinary)
- **Pasos:** `POST /api/upload/local` (multipart `file`).
- **Esperado:** 200; `{ secure_url, public_id }`; `GET secure_url` → 200 sirve el archivo.
- *(Validado en vivo.)*

### TC-UP-03 · Local bloqueado en prod
- **Precondición:** Cloudinary configurado.
- **Esperado:** `POST /api/upload/local` → 400 (solo disponible sin Cloudinary).

---

## 7. Importación masiva (admin)

### TC-IMP-01 · Descargar plantilla
- **Pasos:** UI Dashboard → Importar → descargar CSV/XLSX; o `GET /import/template?format=csv`.
- **Esperado:** archivo con columnas esperadas (ver `docs/import-template.md`).

### TC-IMP-02 · Preview (dry-run)
- **Pasos:** subir archivo en "Importar" → preview.
- **Esperado:** filas válidas e inválidas con motivos; no escribe en BD.

### TC-IMP-03 · Commit
- **Pasos:** confirmar importación.
- **Esperado:** crea usuarios/participantes/actividades; idempotente según `duplicateStrategy`; resumen de creados/omitidos.

### TC-IMP-04 · Importación solo admin
- **Pasos:** participante `GET /import/template`.
- **Esperado:** 403.

---

### TC-IMP-05 · Google Sheets: integración no configurada
- **Pasos:** sin `GOOGLE_*` en el backend: `GET /import/sheet/status`; `POST /import/sheet/preview`.
- **Esperado:** status `{ configured: false, reason: "not_configured" }`; preview y commit `503`; la UI muestra la sección deshabilitada con explicación y la carga por archivo sigue funcionando.

### TC-IMP-06 · Google Sheets: estado de la hoja
- **Pasos:** con la integración configurada, `GET /import/sheet/status?spreadsheetId=<id>` para una hoja compartida y para una no compartida; como participante.
- **Esperado:** compartida → `readable: true` con título, hojas, rango resuelto y filas de datos; no compartida → `readable: false, reason: "not_shared"`; participante → 403.
- *(Automatizado con cliente falso en `backend/test/import-sheet.e2e-spec.ts`.)*

### TC-IMP-07 · Google Sheets: preview y commit idempotente
- **Pasos:** hoja con una fila válida conforme, una válida sin FC y una inválida: preview; commit; commit con `skip`; commit con `update`; preview con `range` de otra hoja; preview con cabecera sin `date`.
- **Esperado:** preview `{ total: 3, valid: 2, invalid: 1, warnings: 1 }`; commit crea 2; luego omite 2; luego actualiza 2; el rango selecciona solo esa hoja; cabecera incompleta → 400 nombrando `date`.

### TC-IMP-08 · Google Sheets: fallo de lectura sin import parcial
- **Pasos:** commit sobre una hoja no compartida.
- **Esperado:** 400 mencionando el acceso y ninguna actividad creada.

---

## 8. Salud y monitoreo

### TC-HEALTH-01 · Liveness
- **Pasos:** `GET /api/health`.
- **Esperado:** 200 `{ status:"ok", timestamp }`.

### TC-HEALTH-02 · Readiness (DB)
- **Pasos:** `GET /api/health/db`.
- **Esperado:** 200 `{ status:"ok", db:"up" }`. Si Postgres está caído → `db:"down"`.

---

## 9. Sesiones paralelas (admin + participante)

### TC-PAR-01 · Flujo concurrente de dos roles
- **Pasos:** ejecutar `node scripts/parallel-session-test.mjs`.
- **Esperado:** todas las verificaciones PASS (secciones 1–8) — dos sesiones simultáneas, registro+validación concurrente, RBAC, múltiples retos configurables y múltiples retos activos a la vez.
- **Manual (UI):** abrir dos navegadores/ventanas en incógnito: una con admin, otra con `ana@reto.local`. El participante sube actividad; el admin la valida; el participante refresca y ve `VALIDATED`.

---

## 10. UI / navegación

### TC-UI-01 · Rutas protegidas
- **Pasos:** sin sesión, navegar a `/dashboard`.
- **Esperado:** redirección a `/login`.

### TC-UI-02 · Secciones de admin ocultas para participante
- **Pasos:** login participante; intentar ver `/dashboard/admin/*`.
- **Esperado:** no se muestran/permiten acciones de admin (validaciones, retos, participantes, import).

### TC-UI-03 · Contador de fin de reto
- **Pasos:** participante en dashboard con reto activo.
- **Esperado:** muestra "Finaliza en Xd Yh Zm"; "Finalizado" cuando `endDate` ya pasó.
