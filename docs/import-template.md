# Importación masiva de actividades

Permite cargar muchos registros de actividad de una sola vez (por ejemplo, el
histórico del mes) a partir de una hoja de cálculo. Cada fila se inserta como si
el participante la hubiera registrado manualmente: si el usuario no existe se
crea, se inscribe en el reto correspondiente y se agrega su actividad del día.

Solo usuarios con rol `ADMIN` pueden importar.

## Flujo (Fase 1: plantilla + carga)

1. Entra a `Dashboard -> Importar` (`/dashboard/admin/import`).
2. Descarga la plantilla (XLSX o CSV) desde el botón correspondiente.
3. Complétala (en Excel, LibreOffice o Google Sheets).
4. Súbela y pulsa **Previsualizar** (dry-run: valida fila por fila, no escribe nada).
5. Revisa el resumen y los errores; corrige y vuelve a previsualizar si hace falta.
6. Pulsa **Importar** para aplicar solo las filas válidas.

### Usarla como Google Sheet

1. Abre [Google Sheets](https://sheets.google.com) y crea una hoja en blanco.
2. `Archivo -> Importar -> Subir` y elige `docs/import-template.csv` (o la plantilla descargada).
3. En "Tipo de separador" deja "Detectar automáticamente". Importa.
4. Llena tus filas respetando las columnas.
5. `Archivo -> Descargar -> Valores separados por comas (.csv)` o `Microsoft Excel (.xlsx)`.
6. Sube ese archivo en la pantalla de importación.

## Columnas

- `email` (obligatorio): identifica al participante. Si no existe, se crea el usuario.
- `name` (obligatorio): nombre del participante (se usa al crear el usuario).
- `challengeMonth` (obligatorio): mes del reto, entero 1..12.
- `challengeYear` (obligatorio): año del reto. El reto (mes/año) debe existir previamente.
- `date` (obligatorio): día de la actividad. Formatos aceptados: `YYYY-MM-DD` o `DD/MM/YYYY`.
- `exerciseType` (obligatorio): uno de `RUNNING`, `ELLIPTICAL`, `TREADMILL`, `CYCLING`, `OTHER`.
- `durationMinutes` (obligatorio): entero >= 1.
- `distanceKm` (opcional): número (admite coma o punto decimal).
- `avgHeartRate` (opcional): entero >= 30.
- `heartRateMinutes` (opcional): entero >= 1 con los minutos de registro de FC de la captura; no puede superar `durationMinutes`. Junto con `hasHeartRateProof` determina si la fila cumple la regla `minHeartRateMinutes` del reto.
- `hasHeartRateProof` (opcional): `true`/`false` (también `si`, `1`, `x`).
- `status` (opcional): `PENDING`, `VALIDATED` o `REJECTED`. Si se omite, se usa el "Estado por defecto" elegido en la UI (por defecto `VALIDATED`).
- `notes` (opcional): texto libre.
- `photoUrl` (opcional): URL de una imagen ya alojada (Cloudinary u otra). Se adjunta como foto de la actividad.

## Reglas y comportamiento

- El reto referenciado por `challengeMonth`/`challengeYear` debe existir; si no, la fila se reporta como error.
- Clave única por día: un participante solo puede tener una actividad por día por reto (`challengeId + userId + date`).
  - Si ya existe y la estrategia es **Omitir** (`skip`), la fila se cuenta como omitida.
  - Si la estrategia es **Actualizar** (`update`), se sobrescribe con los datos de la fila.
- Si `status = VALIDATED`, la actividad queda validada por el admin que importa (cuenta para el ranking).
- **Regla de FC:** una fila válida que no cumple `minHeartRateMinutes` del reto (falta `heartRateMinutes`, es menor al mínimo o `hasHeartRateProof` es `false`) se reporta como **advertencia** (`warnings`) y se importa igual. Si queda `PENDING`, el admin deberá validarla con override y nota.
- Usuarios creados durante la importación reciben un password temporal (configurable en la UI; si no, se genera aleatorio). Deben restablecerlo para iniciar sesión.

## Endpoints (backend)

- `GET /api/import/template?format=csv|xlsx` — descarga la plantilla.
- `POST /api/import/activities/preview` — multipart (`file`), dry-run. Devuelve `{ summary, rows }`.
- `POST /api/import/activities/commit?defaultStatus=&duplicateStrategy=&defaultPassword=` — multipart (`file`), aplica la importación. Devuelve un resumen con `created/updated/skipped/usersCreated/participantsCreated/errors`.

Todos requieren `Authorization: Bearer <accessToken>` de un usuario `ADMIN`.

## Importar directo desde Google Sheets (fase 2, implementada)

Permite leer la hoja en vivo por su ID, sin exportar a archivo. Las filas pasan
por **el mismo pipeline** que la carga por archivo: misma validación, mismas
advertencias de FC y misma idempotencia por `(reto, usuario, fecha)`.

### Configuración (una vez, en el backend)

1. En Google Cloud crea (o usa) un proyecto y habilita la **Google Sheets API**.
2. Crea una **cuenta de servicio** (IAM → Service accounts) y genera una clave
   JSON. Del JSON necesitas `client_email` y `private_key`.
3. Define en el backend (`.env` local o variables del despliegue):
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` = `client_email`.
   - `GOOGLE_PRIVATE_KEY` = `private_key` **en una sola línea** con los saltos
     como `\n` (así viene en el JSON; el backend los desescapa). Nunca la
     commitees.
   - `GOOGLE_SHEETS_DEFAULT_RANGE` (opcional): hoja o rango por defecto.
4. Comparte la hoja de cálculo con `client_email` con permiso **Lector**.
5. La fila 1 de la hoja debe ser la cabecera de la plantilla (mayúsculas y
   espacios no importan). Las filas vacías se ignoran; cada celda se trata como
   texto (fechas `YYYY-MM-DD` o `DD/MM/YYYY`).

Sin las variables, la sección "Desde Google Sheets" de la UI aparece deshabilitada
y los endpoints de hoja responden `503`; la carga por archivo sigue funcionando.

### Uso

En **Importar → 3. Desde Google Sheets**: pega el *spreadsheet ID* (el segmento
entre `/d/` y `/edit` de la URL), opcionalmente la hoja o rango (`mayo`,
`mayo!A:Z`), pulsa **Comprobar** (título, hojas, rango resuelto y filas de datos),
**Previsualizar** y **Importar** con las mismas opciones del paso 2.

### Endpoints

- `GET /api/import/sheet/status?spreadsheetId=&range=` — `{ configured, readable, reason?, title?, sheets?, range?, rowCount? }`.
- `POST /api/import/sheet/preview` — body `{ spreadsheetId, range? }`; misma respuesta que el preview por archivo.
- `POST /api/import/sheet/commit?defaultStatus=&duplicateStrategy=&defaultPassword=` — body `{ spreadsheetId, range? }`; misma respuesta que el commit por archivo. Lee toda la hoja antes de escribir: un fallo de lectura nunca deja una importación parcial.

Errores: hoja no compartida, inexistente o rango inválido → `400` con el motivo;
cabecera incompleta → `400` nombrando las columnas que faltan.

### Cómo se autentica (y alternativas)

El backend firma un JWT RS256 con la clave de la cuenta de servicio usando el
módulo `crypto` de Node, lo canjea en `oauth2.googleapis.com/token` por un access
token (cacheado ~55 min) y llama a la API REST de Sheets con `fetch`. No agrega
dependencias. Si la integración crece, `backend/src/import/sheets-auth.ts` puede
reemplazarse por `google-auth-library` sin tocar el resto; las alternativas
evaluadas (`googleapis`, enlace público CSV, OAuth de usuario, API key) están en
`openspec/specs/google-sheets-import/` (design del cambio archivado).
