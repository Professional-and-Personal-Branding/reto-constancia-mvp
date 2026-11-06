# Propuesta de mejoras y nuevas funcionalidades: Reto de Constancia

**Estado:** Aprobada por el owner el 2026-10-29 con P1–P4 recomendadas. Cambios de OpenSpec: `validation-queue-filters`, `login-timing-parity`, `db-backup-verify` y `edit-pending-activity`; las afirmaciones que no coincidieron con el código están corregidas en el `design.md` de cada uno.

## 1. Resumen y método

- **Proceso:** se exploró con 4 lentes (ReAct), el crítico revisó las ideas y 3 evaluadores las votaron por mayoría. El disyuntor no se activó.
- **Rondas:** 1. **Disparos del disyuntor:** 0.
- **Ideas:** de 20 candidatas sobrevivieron 4. Dos se aprobaron por unanimidad (3/3) y dos por mayoría (2/3).
- **Migraciones:** ninguna de las 4 cambia el esquema ni agrega dependencias o variables de entorno.
- **Puntaje:** combina valor, riesgo y encaje. Escalas: valor 1–5, riesgo 1–5 (más alto es más riesgoso), encaje 1–5.

## 2. Tabla priorizada

| ID | Título | Valor | Riesgo | Encaje | Esfuerzo | Migración | Votos | Puntaje |
|---|---|---|---|---|---|---|---|---|
| ADM-1 | Cola de validación por reto, más antigua primero, con contador | 4,0 | 1,0 | 5,0 | S | No | 3/3 | 8,0 |
| PAR-1 | Corregir una actividad pendiente sin perder las fotos | 4,0 | 2,3 | 4,3 | M | No | 3/3 | 6,0 |
| CON-3 | Login con el mismo tiempo de respuesta si el usuario no existe o está inactivo | 2,7 | 1,0 | 4,0 | S | No | 2/3 | 5,7 |
| CON-4 | Script de respaldo que prueba la restauración | 3,3 | 2,0 | 3,3 | S | No | 2/3 | 4,7 |

## 3. Detalle por idea

### ADM-1: Cola de validación por reto (cambio `validation-queue-filters`)

- **Problema:** con varios retos activos la cola mezcla todas las actividades y muestra primero las más nuevas. El admin no sabe cuántas hay pendientes sin entrar a la pantalla.
- **Evidencia (verificada):**
  - `activities.service.ts` ordena por `date desc, createdAt desc`.
  - La pantalla llama a `/activities/pending` sin `challengeId`.
  - La propuesta s6 fusionó este punto en `multi-challenge-operations`, pero la UI no muestra el filtro.
- **Propuesta:**
  - Selector de reto en la pantalla. La API ya acepta `challengeId`.
  - Orden ascendente por defecto, con opción de invertirlo.
  - Contador de pendientes en el menú admin, con un endpoint nuevo `GET /activities/pending/count`.
  - `validate` y `reject` no cambian.
- **Escenarios clave:**
  - El admin elige un reto y ve solo sus pendientes, de la más antigua a la más nueva.
  - El admin invierte el orden.
  - El menú muestra el número de pendientes sin entrar a la cola.
  - Sin reto elegido, la cola mantiene el comportamiento actual de mostrar todo.
- **Riesgos:** mínimos. El filtro es casi solo de UI y el conteo es una consulta simple.
- **Notas de los evaluadores:** es el cuello de botella diario del owner. El esfuerzo S es realista. El cambio es chico y de alto valor para operar varios retos a la vez.
- **PR:** uno solo, con la API (endpoint de conteo) y la web (selector, orden y contador).

### PAR-1: Corregir una actividad pendiente (cambio `edit-pending-activity`)

- **Problema:** un error de tipeo en minutos, km o FC de una actividad PENDING obliga a retirarla y volver a subir las fotos. Si el reto está por cerrar, eso puede costar el día.
- **Evidencia (verificada):**
  - `activities.controller.ts` solo expone POST, GET y DELETE.
  - No hay spec de edición en `openspec/specs`.
  - `activity-withdrawal` cubre solo el retiro.
- **Propuesta:**
  - Endpoint `PATCH /api/activities/:id`, solo para el dueño, con la actividad en PENDING y el reto en ACTIVE.
  - Campos editables: `exerciseType`, `durationMinutes`, `distanceKm`, `avgHeartRate`, `heartRateMinutes` y `notes`.
  - La fecha y las fotos no se editan.
  - Se reutiliza `heart-rate-rule.ts`.
  - En la web, un botón Editar con formulario en línea.
  - Las actividades VALIDATED y REJECTED no se editan.
- **Escenarios clave:**
  - El dueño corrige los minutos de una actividad PENDING y la actividad sigue en PENDING con las mismas fotos.
  - La edición se rechaza si la actividad ya fue validada o rechazada, si el reto no está ACTIVE o si quien edita no es el dueño.
  - Los datos nuevos de FC se vuelven a evaluar con la regla vigente.
  - Si el admin valida al mismo tiempo que el dueño edita, gana una sola de las dos operaciones.
- **Riesgos:**
  - Carrera con la validación del admin: hay que usar `lockOpenActivity`.
  - La regla de FC y la de duplicados por día deben volver a evaluarse con el bloqueo del reto tomado.
  - Puede solaparse con el reenvío de actividades rechazadas (incremento 2).
- **Notas de los evaluadores:** es un dolor real y frecuente en el celular con el plazo corriendo. No necesita migración. El esfuerzo M es realista y el valor para el participante es alto.
- **PR:** PR 1 con la API y PR 2 con la web.

### CON-3: Login con tiempo uniforme (cambio `login-timing-parity`)

- **Problema:** si el correo no existe o el usuario está inactivo, el login responde sin ejecutar `argon2.verify`. Esa diferencia de latencia permite averiguar qué correos están registrados.
- **Evidencia (verificada):**
  - En `auth.service.ts:60-62`, el error por `!user || !user.active` se lanza antes de `argon2.verify`.
  - El límite de 5 intentos por minuto es solo por IP.
- **Propuesta:** cuando no hay usuario o está inactivo, verificar siempre contra un hash argon2 ficticio calculado de antemano, con los mismos parámetros que los hashes reales.
- **Escenarios clave:**
  - Los casos de usuario inexistente, usuario inactivo y contraseña incorrecta devuelven el mismo error y tardan lo mismo.
  - El login válido no cambia.
- **Riesgos:** bajos. Hay que fijar los parámetros del hash ficticio iguales a los reales.
- **Notas de los evaluadores:** es un cambio de pocas líneas y bajo riesgo. Un evaluador votó en contra porque la plataforma es cerrada y el admin da de alta a los usuarios, así que el impacto de averiguar correos es bajo.
- **PR:** uno solo, en `auth`. Un contador de fallos por correo en memoria quedaría como seguimiento aparte, fuera de este cambio.

### CON-4: Respaldo con verificación de restauración (cambio `db-backup-verify`)

- **Problema:** el respaldo es un `pg_dump` manual descripto en el runbook, sin script ni prueba de restauración. El rollback de las releases con migración depende de ese respaldo.
- **Evidencia (verificada):**
  - En `scripts/` existe `cloudinary-orphans.mjs` como precedente de script operativo, pero ningún script de respaldo.
  - El runbook remite a restaurar el respaldo de la sección 5.1.
- **Propuesta:** un script `scripts/db-backup.mjs` que:
  1. hace un `pg_dump` con fecha en el nombre;
  2. lo restaura en una base temporal local, protegida por la guarda de `scripts/lib/test-db.mjs`;
  3. compara los conteos de filas por tabla;
  4. limpia la base temporal;
  5. termina con OK o FALLO.

  El uso y la retención se documentan en la sección 5.1 del runbook. No agrega dependencias.
- **Escenarios clave:**
  - El respaldo se restaura con los mismos conteos por tabla y el script termina en OK.
  - Si un conteo difiere, termina en FALLO con código distinto de 0.
  - Si la base destino no es local, el script se niega a operar.
- **Riesgos:**
  - Que el script toque una base que no es local. Lo mitiga la guarda existente.
  - Depende de tener `pg_dump` local y Docker.
- **Notas de los evaluadores:**
  - Protege al owner de la peor falla posible: un rollback que no se puede hacer.
  - Es la red de seguridad para la release 1.14, que trae la migración del reenvío de actividades.
  - Un evaluador votó en contra porque no es producto y lo ve como un `chore` sin ciclo de propuesta.
- **PR:** uno solo, con el script y el runbook.

## 4. Orden de entrega recomendado

| Release | Contenido | Por qué |
|---|---|---|
| Próxima minor | ADM-1 y CON-3 | Ambas son de esfuerzo S, de bajo riesgo y sin migración. ADM-1 alivia el cuello de botella diario del owner. |
| La misma minor, o un `chore` previo a 1.14 | CON-4 | Tiene que estar fusionada **antes** de cualquier release con migración, como la 1.14 del reenvío. |
| La minor siguiente | PAR-1, en 2 PR | Es la de más riesgo por la concurrencia. Conviene entregarla después del incremento 2 del reenvío o coordinada con él, para no tocar a la vez las mismas reglas de bloqueo y de duplicados por día. |

**Dependencias:**
- CON-4 va antes de 1.14.
- PAR-1 se ordena respecto del reenvío (incremento 2).
- ADM-1 y CON-3 no dependen de nada.

## 5. Descartadas y por qué

En esta ronda ninguna idea evaluada recibió mayoría de votos en contra: la lista de descartadas por votación está vacía. Las otras 16 candidatas no llegaron a sobrevivir al proceso. Los datos de esta ronda no incluyen el motivo de cada una, así que no los detallo para no inventarlos.

## 6. Preguntas para el owner

**P1. ¿PAR-1 va antes o después del reenvío de actividades rechazadas (incremento 2)? [BLOQUEANTE para PAR-1]**
- Opciones:
  - (a) Después del incremento 2.
  - (b) Antes.
  - (c) En paralelo, coordinando los bloqueos.
- **Recomendación: (a).** Las dos funciones tocan `lockOpenActivity` y la regla de duplicados por día. Hacerlas en serie evita conflictos y un doble diseño.

**P2. ¿Qué campos se pueden editar en PAR-1? [NO BLOQUEANTE]**
- Opciones:
  - (a) Los propuestos (`exerciseType`, `durationMinutes`, `distanceKm`, `avgHeartRate`, `heartRateMinutes`, `notes`), sin fecha ni fotos.
  - (b) Lo mismo más la fecha.
- **Recomendación: (a).** Cambiar la fecha obliga a revisar de nuevo los duplicados por día y la ventana del reto. Para eso existe el retiro.

**P3. ¿CON-4 pasa por el ciclo de OpenSpec o va como `chore`? [NO BLOQUEANTE]**
- Opciones:
  - (a) Cambio de OpenSpec completo en la capacidad `platform-operations`.
  - (b) PR `chore/` con el script y el runbook, sin propuesta.
- **Recomendación: (a), en versión liviana.** Es un requisito operativo del que depende el rollback y conviene que quede en `platform-operations`. Si el owner prefiere rapidez, (b) también es razonable porque no es funcionalidad de producto.

**P4. ¿Cómo se comporta por defecto la cola de ADM-1? [NO BLOQUEANTE]**
- Opciones:
  - (a) Orden ascendente por defecto y un contador total de pendientes de todos los retos activos en el menú.
  - (b) Se mantiene el orden descendente y el ascendente queda como opción.
- **Recomendación: (a).** Validar primero lo más antiguo es lo que importa cuando hay plazo de cierre. Un solo contador total mantiene el endpoint simple; el desglose por reto se ve en el selector.

