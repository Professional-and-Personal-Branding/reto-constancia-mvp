> **Estado:** Aprobada por el owner el 2026-10-28 con las decisiones D1–D4 recomendadas.

# Propuesta de mejoras y nuevas funcionalidades — Reto de Constancia (después de v1.12.1)

## 1. Resumen y método

- **Proceso multiagente:** primero una exploración ReAct con 4 lentes. Después, la reflexión de un agente crítico y la evaluación de 3 evaluadores, que votaron por mayoría. Un disyuntor (circuit breaker) cortaba el proceso si fallaba.
- **Ideas exploradas:** 20.
- **Rondas:** 1. El disyuntor no saltó ninguna vez (0 strikes).
- **Ideas aprobadas por mayoría:** 4.
  - Por unanimidad (3 de 3): CON-1 y ADM-2.
  - Por mayoría (2 de 3): PAR-1 y ADM-4.
- **Puntaje:** el proceso calculó la puntuación combinada a partir del valor, el riesgo y el encaje. Cada criterio va de 1 a 5 y es el promedio de los evaluadores.
- **Sin migraciones:** ninguna de las 4 ideas cambia el esquema, agrega dependencias ni requiere variables de entorno nuevas.
- **Siguiente paso:** cada idea necesita su propio cambio de OpenSpec y la aprobación del owner antes de escribir código. Este documento es la propuesta y todavía no tiene specs.

## 2. Tabla priorizada

| # | ID | Título | Valor | Riesgo | Encaje | Esfuerzo | Migración | Votos | Puntaje |
|---|----|--------|------:|-------:|-------:|:--------:|:---------:|:-----:|--------:|
| 1 | CON-1 | Sesión efectiva de inmediato y protección del último admin | 5 | 2 | 5 | S | No | 3/3 | 8.0 |
| 2 | PAR-1 | Tarjeta "Mi avance" con la meta para calificar | 4 | 1 | 5 | S | No | 2/3 | 8.0 |
| 3 | ADM-4 | Marcar pagos en lote y lista de pagos pendientes | 3.67 | 2 | 4 | S | No | 2/3 | 5.67 |
| 4 | ADM-2 | Reinicio de contraseña por el admin y página de usuarios | 4 | 2.67 | 4 | M | No | 3/3 | 5.33 |

## 3. Detalle por idea

### CON-1 — Sesión efectiva de inmediato y protección del último admin

**Problema y evidencia**
- `JwtStrategy.validate` devuelve el payload sin consultar la base de datos. En `backend/src/auth/strategies/jwt.strategy.ts` el método es `validate(payload) { return payload; }` (verificado).
  - Consecuencia: un usuario desactivado o degradado conserva su acceso, incluidas las rutas de admin, hasta que vence su token (15 min).
- `users.service.ts` → `update` no tiene ninguna protección. `PATCH /users/:id` permite que el último admin se desactive o se degrade (verificado).
- El escenario "Inactive user with a live access token" del spec `account-self-service` solo cubre `/me/password`.
- El roadmap del 2026-10-04 (punto 14) ya pedía comprobar en el JWT que el usuario esté activo.

**Propuesta acotada**
- `JwtStrategy.validate` consulta al usuario por su clave primaria (`id`, `role`, `active`):
  - si el usuario está inactivo, responde 401;
  - si está activo, usa el rol vigente en la base de datos y no el del token.
- `UsersService.update` responde 400, con mensaje en español, en tres casos:
  - desactivar al último admin activo;
  - degradar al último admin activo;
  - que un usuario se desactive a sí mismo.
- Una prueba e2e por caso.
- Sin cambios de esquema ni dependencias nuevas.

**Escenarios clave**
- Un usuario desactivado usa un token todavía vigente → 401.
- Un admin degradado a participante usa un token todavía vigente → 403 en las rutas de admin.
- El último admin activo intenta desactivarse o degradarse → 400.
- Un usuario intenta desactivarse a sí mismo → 400.
- Con dos admins activos, degradar a uno de ellos → permitido.

**Riesgos**
- Agrega una consulta a la base por cada petición. Es por clave primaria, así que es barata y los evaluadores la aceptan.
- Pueden romperse pruebas e2e que hoy usan tokens de usuarios ya desactivados.

**Notas de los evaluadores**
- Los 3 confirmaron el hueco en el código.
- Uno pidió que el cambio también cubra el rol vigente, no solo el estado activo.
- Es la base de ADM-2.

**Partición:** 1 PR (`fix/`).

### PAR-1 — Tarjeta "Mi avance" con la meta para calificar

**Problema y evidencia**
- El participante no ve sus puntos, ni cuántos días le faltan para calificar, ni si todavía puede lograrlo.
- `dashboard/page.tsx` muestra estadísticas sin puntos ni meta.
- En `results/page.tsx`, el mínimo de días y la marca "no califica" aparecen solo en el ranking.
- El dato existe en `schema.prisma` (`minValidatedDaysToQualify`).
- El spec `participant-calendar` define el calendario como solo de visualización ("display-only").

**Propuesta acotada**
- Una tarjeta en el dashboard calculada solo con datos que ya existen:
  - la fila del propio participante en el ranking;
  - `minValidatedDaysToQualify`;
  - los días válidos que quedan.
- Mensajes de ejemplo: "Llevas 8 de 12 días; quedan 9 días válidos, aún puedes llegar" o "Ya calificas".
- El cálculo es una función pura en `lib/` con sus pruebas.
- Sin cambios de API ni migración.

**Escenarios clave**
- Ya alcanzó el mínimo → "Ya calificas".
- No lo alcanzó, pero los días que quedan alcanzan → avance más "aún puedes llegar".
- Los días que quedan no alcanzan → mensaje de que ya no llega a calificar.
- Participante sin fila en el ranking → la tarjeta no se muestra o se muestra en cero.

**Riesgos**
- El cálculo debe coincidir con `scoring.ts`.
- La tarjeta no debe prometer la calificación antes del cierre del reto.

**Notas de los evaluadores**
- Valor alto y costo mínimo.
- El voto en contra no fue por la calidad de la idea: se debió al cupo limitado de votos a favor.
- Un evaluador sugiere juntarla con "PAR-2" en un solo cambio del dashboard. PAR-2 no está entre los datos aprobados y no se detalla aquí.

**Partición:** 1 PR (`feature/`).

### ADM-4 — Marcar pagos en lote y lista de pagos pendientes

**Problema y evidencia**
- Los pagos se marcan uno a uno: `participants/page.tsx` envía un PATCH por usuario.
- A inicio de mes, con la cuota estándar, son decenas de clics.
- No existe una lista copiable de quién debe.
- La lógica que se reutilizaría ya existe:
  - `challenges.service` → `markPayment` (un usuario a la vez);
  - los estados `paid`, `partial` y `unpaid` de `finance.service`.
- Regla que hay que respetar: el spec `challenge-finance` dice que los pagos se congelan al cerrar el reto ("Payments close with the challenge").

**Propuesta acotada**
- **API:** `PATCH /challenges/:id/participants/payments` con `{ userIds[], paid: true }`. El endpoint:
  - registra la cuota del reto como `amountPaid`;
  - es atómico e idempotente;
  - bloquea el reto igual que lo hace `markPayment`;
  - respeta el congelamiento al cierre.
- **Web:**
  - acción "Marcar seleccionados como pagados", con confirmación del total;
  - acción "Copiar pendientes", con nombre y monto adeudado, según la lógica de `finance.service`.
- Fuera del alcance: comprobantes de pago. Sin cambios de esquema.

**Escenarios clave**
- Lote válido → todos quedan pagados en una sola transacción.
- Repetir el mismo lote → no cambia nada (idempotencia).
- Reto cerrado → se rechaza con un mensaje en español.
- El lote incluye a alguien con pago parcial → ese pago no se sobrescribe (ver D2).
- "Copiar pendientes" → la lista coincide con los estados `unpaid` y `partial`.

**Riesgos**
- Hay casos límite al combinar la atomicidad con el congelamiento al cierre.
- Hay riesgo de sobrescribir pagos parciales que ya existen.

**Notas de los evaluadores**
- Dos evaluadores lo ven como un dolor mensual concreto del owner y de bajo riesgo.
- El tercero lo considera poco frecuente y propone posponerlo.

**Partición:** 1 PR (`feature/`) con la API y la web juntas.

### ADM-2 — Reinicio de contraseña por el admin y página de usuarios

**Problema y evidencia**
- `UsersService.resetPassword` (`users.service.ts:96`) existe, pero ningún controlador lo expone (verificado).
- La recuperación por correo se descartó porque el admin iba a emitir contraseñas temporales (`docs/propuestas-features-2026-10-04.md`, sección 6, y punto 14 del roadmap). Hoy esas contraseñas no se pueden emitir desde la plataforma.

**Propuesta acotada**
- **API:** `POST /users/:id/reset-password`, solo para admin. El endpoint:
  - genera una contraseña temporal que cumple la política de contraseñas (`password-policy`);
  - la devuelve una sola vez;
  - revoca las sesiones del usuario con el mismo mecanismo que `/me/password`.
- **Web:** página `/dashboard/admin/users` con lista, búsqueda, activar y desactivar, y cambio de rol.
- Las protecciones del último admin viven en CON-1, que se entrega antes.
- Sin cambios de esquema.

**Escenarios clave**
- Un admin reinicia la contraseña de un usuario → recibe la temporal una sola vez y las sesiones previas del usuario dejan de funcionar.
- Un usuario que no es admin llama al endpoint → 403.
- La contraseña temporal cumple la política de contraseñas.
- Desde la página, desactivar o degradar al último admin → bloqueado por CON-1.

**Riesgos**
- La respuesta que contiene la contraseña temporal debe ir sin caché y nunca registrarse en los logs.
- Un evaluador pidió que el usuario esté obligado a cambiarla (ver D3).
- Con la página de usuarios, el esfuerzo sube de M a M-L.

**Notas de los evaluadores**
- Los 3 votaron a favor y lo ven como un bloqueo operativo real.
- Depende de CON-1.
- Los 3 coinciden en separar el endpoint de la página.

**Partición:** 2 PR, primero la API y después la interfaz (`feature/`).

## 4. Orden de entrega recomendado

**Release 1.13.0**
- **CON-1:** cierra un hueco de seguridad real y es requisito de ADM-2.
- **PAR-1:** es independiente, barata y refuerza el objetivo central del reto: la constancia.
- Son 2 PR independientes entre sí.

**Release 1.14.0**
- **ADM-2, PR de API** (después de CON-1).
- **ADM-2, PR de interfaz** (después de la API).
- **ADM-4:** 1 PR independiente de los otros dos.

**Dependencias:** CON-1 → ADM-2 (API) → ADM-2 (interfaz). PAR-1 y ADM-4 no dependen de ninguna otra.

**Por qué este orden:** primero la seguridad y lo de menor riesgo. La administración de usuarios y de pagos va en una release posterior porque concentra la mayor superficie de cambio y la única idea con un voto para posponerla (ADM-4).

## 5. Descartadas

Los datos entregados no incluyen ninguna idea descartada con su motivo. La lista "Descartadas (no votadas yes)" llegó vacía.

De las 20 ideas exploradas, 16 no quedaron entre las aprobadas. No hay registro de sus títulos ni de las razones, así que no se informan aquí para no inventarlas. Entre ellas está PAR-2, mencionada por un evaluador, que tampoco tiene datos.

## 6. Decisiones para el owner

**D1. Versión de CON-1: ¿1.13.0 junto con PAR-1, o un parche 1.12.2 inmediatamente después de 1.12.1?**
- Recomendación: un parche 1.12.2 solo con CON-1, si se va a desplegar a producción antes de 1.13.0.
- Si no hay despliegue previo, que CON-1 vaya en 1.13.0 como está planteado.
- Motivo: es un hueco de seguridad que no conviene que espere a otra funcionalidad.

**D2. ADM-4: ¿qué hacer con quien ya tiene un pago parcial o un monto distinto de la cuota?**
- Recomendación: no sobrescribir. Esos usuarios quedan fuera del lote y la confirmación los muestra aparte.
- La acción en lote solo pasa de "unpaid" a "paid" con la cuota estándar.

**D3. ADM-2: ¿obligar al usuario a cambiar la contraseña temporal en su próximo ingreso?**
- Si no existe ya un indicador para esto en el modelo `User`, obligarlo requiere una **MIGRACIÓN** (un campo nuevo).
- Recomendación: no forzarlo en esta iteración. Sí revocar las sesiones, devolver la contraseña una sola vez, sin caché ni registro en logs, y mostrar en la web la indicación de cambiarla.
- Si el owner quiere forzarlo, se especifica como un cambio aparte con migración.

**D4. PAR-1: ¿cómo se dice la proyección?**
- Recomendación: textos de proyección que no prometan nada, por ejemplo "aún puedes llegar" o "ya alcanzas el mínimo; se confirma al cierre".
- Calcular con la misma regla que `scoring.ts`, extraída o reflejada en la función pura y cubierta por pruebas de paridad.

`openspec validate --all --strict` no se ejecutó en este paso, porque todavía no se crearon cambios en `openspec/changes/`. Se crean y se validan al aprobar cada idea.