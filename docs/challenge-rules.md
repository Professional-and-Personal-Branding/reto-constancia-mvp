# Retos múltiples y reglas configurables

Este documento analiza qué tan configurable es el reto mes a mes, qué reglas son
**parametrizables hoy**, cuáles están **fijas en código**, y qué **brechas (gaps)**
hay que cubrir para soportar la variabilidad real entre meses.

> Validado en vivo el 2026-06-04 con `scripts/parallel-session-test.mjs`
> (23/23 checks PASS), incluyendo creación de un segundo reto con reglas distintas.

## 1. Modelo de un reto (`Challenge`)

Cada mes es una entidad `Challenge` independiente con sus propias reglas:

| Campo | Tipo | Default | ¿Configurable por reto? | ¿Se aplica en la lógica? |
|---|---|---|---|---|
| `name` | string | — | Sí | Informativo |
| `month` / `year` | int | — | Sí (único por mes/año) | Clave de unicidad |
| `startDate` / `endDate` | fecha | — | Sí | **Sí**: la actividad debe caer dentro del período |
| `validDays` | int[] (0=Dom..6=Sáb) | `[1..6]` | Sí | **Sí**: la actividad solo se acepta en días válidos |
| `minHeartRateMinutes` | int | `20` | Sí | **No** (ver gap #2) |
| `feePerParticipant` | decimal | `0` | Sí | Informativo (se muestra) |
| `budgetTotal` | decimal | `0` | Sí | Informativo (ver gap #3) |
| `currency` | string | `BOB` | Sí | Informativo |
| `prizeDescription` | string? | — | Sí | Informativo |
| `status` | DRAFT/ACTIVE/COMPLETED | `DRAFT` | Sí | **Sí**: solo `ACTIVE` admite registrar actividades |

Endpoints (admin) para gestionarlo:
- `POST /challenges` — crear con reglas propias.
- `PATCH /challenges/:id` — editar cualquier regla.
- `POST /challenges/:id/activate` · `POST /challenges/:id/close`.
- `POST /challenges/:id/awards` — premiar (cierra el reto).

## 2. Reglas aplicadas vs. informativas

**Se aplican automáticamente al registrar una actividad** (`ActivitiesService.create`):
1. El reto debe estar `ACTIVE`.
2. El usuario debe ser participante del reto.
3. La fecha debe estar dentro de `[startDate, endDate]`.
4. El día de la semana debe estar en `validDays`.
5. Una sola actividad por día por usuario (`@@unique(challengeId,userId,date)`).
6. Al menos una foto/captura es obligatoria.

**Cálculo de ganadores** (`ResultsService`):
- Ranking por **días validados** (desc), desempate suave por **km** (desc).
- 1 en el tope → gana solo. 2 empatados → ganan ambos (se divide presupuesto).
  3+ empatados → sorteo aleatorio, eligen 2. 0 → sin ganador.
- Si el admin registra premiación manual, esta **prevalece** sobre el cálculo.

## 3. Brechas (gaps) para la variabilidad mes a mes

Estas son las limitaciones detectadas que conviene resolver según cómo varíen
las reglas entre meses:

**Gap #1 — Múltiples retos ACTIVE a la vez. RESUELTO** (cambio OpenSpec
`multi-active-challenges`, spec `challenge-lifecycle`). Decisión del negocio:
**pueden coexistir varios retos activos** y cada participante elige en cuál trabaja.

- Ciclo de vida: solo `DRAFT → ACTIVE`; reactivar un `ACTIVE` es idempotente;
  un `COMPLETED` **no** se reactiva (400). Aplica igual con
  `PATCH /challenges/:id { status: "ACTIVE" }`. Activar un reto nunca cambia el
  estado de otro.
- `GET /challenges/active/list`: todos los activos, del más reciente al más
  antiguo (por `startDate`), con `isParticipant` calculado para quien consulta.
- `GET /challenges/active` (compatibilidad): el activo más reciente en el que
  participa el usuario; si no participa en ninguno, el activo más reciente; si no
  hay activos, `null`.
- Web: con 2+ retos activos aparece un **selector en el encabezado**; la elección
  persiste en ese navegador (`localStorage`, no por cuenta) y, si el reto elegido
  se cierra, vuelve al reto por defecto.
- Actividades y ranking son independientes por reto: **una actividad por día por
  reto**; el mismo día puede registrarse en dos retos distintos.

**Gap #2 — `minHeartRateMinutes` se valida automáticamente. RESUELTO** (cambio
OpenSpec `enforce-heart-rate-minutes`, spec `activity-heart-rate-compliance`).

- Cada actividad registra **`heartRateMinutes`**: los minutos de registro de FC
  que muestra la captura (distinto de `durationMinutes`, la duración de la sesión).
  Nunca puede superar `durationMinutes`.
- **Cumple** la regla cuando `heartRateMinutes ≥ minHeartRateMinutes` **y** hay
  captura de FC. En el registro, `hasHeartRateProof` se deriva de las fotos: es
  `true` solo si se adjunta una foto `HEART_RATE`.
- **Registro**: una actividad que no cumple se rechaza con 400 (el mensaje indica
  el mínimo). La web bloquea el envío y explica qué falta.
- **Validación del admin**: una actividad que no cumple (p. ej. importada como
  `PENDING`) solo se valida con `{ override: true, note }`; la nota queda en
  `validationNote`. Las que cumplen se validan como siempre.
- **Importación**: nueva columna opcional `heartRateMinutes`; las filas que no
  cumplen se reportan como **advertencias** y se importan igual (registros
  históricos).
- Todas las respuestas de actividades incluyen `heartRateCompliant` (derivado).
- `minHeartRateMinutes = 0` desactiva la regla para ese reto.

**Gap #3 — Reglas de premiación/puntaje fijas en código.**
El criterio (días validados → km), el número de ganadores (2) y el reparto de
presupuesto están **hardcodeados** en `ResultsService`. No hay parámetros como:
mínimo de días para calificar, puntaje por km, número de ganadores variable,
peso por tipo de ejercicio, etc.
→ Si esto cambia entre meses, hay que parametrizarlo (nuevos campos en
`Challenge`) o introducir un motor de reglas.

**Gap #4 — Cuota/presupuesto son informativos.**
`feePerParticipant`/`budgetTotal` se muestran pero no se concilian con los pagos
ni se reparte el premio automáticamente.

## 4. Plantilla para comparar reglas de dos meses

> Cuando me pases las reglas de un mes y del siguiente, llenamos esta tabla para
> decidir qué se resuelve con configuración (ya soportado) y qué requiere cambios.

| Regla | Mes A | Mes B | ¿Cambia? | ¿Soportado hoy? | Acción |
|---|---|---|---|---|---|
| Período (start/end) | | | | Sí (config) | — |
| Días válidos | | | | Sí (config) | — |
| Minutos mín. de FC | | | | Parcial (no se valida) | Definir si es automático |
| Cuota / moneda | | | | Sí (config, informativo) | — |
| Presupuesto / premio | | | | Sí (informativo) | Definir si se reparte |
| Criterio de ranking | | | | No (fijo) | Posible parametrización |
| Nº de ganadores | | | | No (fijo en 2 si empate 3+) | Posible parametrización |
| Regla de desempate | | | | No (fijo: sorteo) | Posible parametrización |
| Mínimo para calificar | | | | No existe | Posible nuevo campo |

## 5. Recomendación

- A corto plazo, lo que cambia entre meses y **ya es configurable** (período,
  días válidos, cuota, moneda, premio, descripción) se resuelve creando un nuevo
  `Challenge` por mes — sin tocar código.
- Antes de soportar variabilidad de **puntaje/premiación**, definir las reglas de
  los dos meses de ejemplo y decidir entre: nuevos campos en `Challenge`,
  o un motor de reglas. Esto se prioriza con la info que enviarás.
- El **Gap #1** quedó resuelto permitiendo varios retos activos (sección 3);
  los retos que se solapan en fechas funcionan de forma independiente.
