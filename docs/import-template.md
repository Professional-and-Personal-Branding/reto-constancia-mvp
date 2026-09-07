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

## Fase 2 (posterior): integración con Google Sheets API

Pendiente de implementar. Permitiría leer una hoja en vivo por su ID, sin
exportar a archivo. Diseño previsto:

- Crear un proyecto en Google Cloud y habilitar la **Google Sheets API**.
- Crear una **service account** y compartir la hoja con su email (permiso lector).
- Guardar credenciales como variables de entorno en el backend
  (`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEETS_SPREADSHEET_ID`).
- Nuevo endpoint `POST /api/import/activities/from-sheet` que:
  1. Lee el rango configurado con `googleapis`.
  2. Reutiliza exactamente la misma validación y lógica de `ImportService`
     (`validateRow` + `commit`) que ya usa la carga por archivo.
- Ventaja: el admin solo edita la hoja y dispara la sincronización; misma
  semántica de idempotencia (omitir/actualizar por día).
