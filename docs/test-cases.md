# Casos de prueba — Reto de Constancia

Guía de pruebas de la plataforma: cómo dejar el entorno listo, qué cubre la batería
automatizada, los recorridos manuales paso a paso, y el catálogo completo de casos.

- **Parte 0 — Preparar el entorno**: de repositorio clonado a app funcionando.
- **Parte 1 — Batería automatizada**: qué corre solo y con qué comando.
- **Parte 2 — Recorridos guiados**: nueve recorridos numerados, pensados para ejecutarse
  antes de un despliegue o al validar un cambio grande. Seis de ellos están automatizados
  con Playwright (`cd e2e && npm test`, ver [`e2e-playwright.md`](./e2e-playwright.md));
  la versión manual sigue sirviendo para revisar la app desplegada.
- **Parte 3 — Catálogo de casos**: vive en [`qa/test-cases.md`](./qa/test-cases.md): 102 casos
  con precondiciones, datos, pasos, resultado esperado y las pruebas que validan cada uno,
  con su estado en la última validación.

El detalle técnico de las suites automatizadas está en [`testing.md`](./testing.md).

---

## Parte 0 · Preparar el entorno

### 0.1 Requisitos

Node 20 o 22, Docker (para Postgres) y `npm`. Todo lo demás se instala con `npm install`.

### 0.2 Levantar la plataforma (paso a paso)

1. **Base de datos.** Desde la raíz del repositorio:
   ```bash
   docker compose up -d postgres
   ```
   Postgres queda en el puerto **5433** del host (5432 dentro del contenedor) para no chocar
   con otras bases locales. Verifica con `docker ps` que `reto-constancia-db` esté `healthy`.

2. **Variables del backend.** Solo la primera vez:
   ```bash
   cd backend
   cp .env.example .env
   ```
   Edita `.env`: `DATABASE_URL` ya apunta a `localhost:5433`; genera los secretos con
   `openssl rand -base64 64` para `JWT_SECRET` y `JWT_REFRESH_SECRET`. Deja `CLOUDINARY_*`
   vacío para usar el simulador local de subidas.

3. **Dependencias, migraciones y datos de demo:**
   ```bash
   cd backend
   npm install
   npx prisma migrate deploy
   npm run prisma:seed
   ```

4. **API:**
   ```bash
   cd backend && npm run start:dev      # queda escuchando en :3002
   ```

5. **Frontend**, en otra terminal:
   ```bash
   cd frontend
   npm install                          # solo la primera vez
   npm run dev                          # queda escuchando en :3005
   ```

6. Abre `http://localhost:3005/login`. La documentación de la API está en
   `http://localhost:3002/api/docs`.

### 0.3 Datos y credenciales del seed

| Recurso | Valor |
|---|---|
| Frontend | http://localhost:3005 |
| API | http://localhost:3002/api |
| Swagger | http://localhost:3002/api/docs |
| Admin | `admin@reto.local` / `ChangeMe123!` |
| Participantes | `ana@`, `bruno@`, `carla@`, `diego@`, `elena@reto.local` / `ChangeMe123!` |
| Reto activo | "Reto Mayo 2026" (01–31 may, días válidos Lun–Sáb, cuota 120 BOB, presupuesto 600 BOB) |
| Actividades | Ana y el resto ya tienen días validados, pendientes y rechazados |

> El seed **no** crea datos de demo cuando `NODE_ENV=production`: ahí solo crea el admin a
> partir de `SEED_ADMIN_*`, y exige `SEED_ADMIN_PASSWORD`.

### 0.4 Reiniciar los datos

```bash
cd backend
npx prisma migrate reset     # borra, migra y vuelve a sembrar
```

Úsalo cuando una corrida interrumpida deje retos o actividades a medias.

---

## Parte 1 · Batería automatizada

Un solo comando desde la raíz, con la API y Postgres arriba:

```bash
node scripts/run-tests.mjs
```

Corre lint, unitarias, build, migraciones, e2e de API, tipos del frontend, lint, build, el
recorrido de sesiones paralelas y los recorridos de UI con Playwright. Solo necesita la base
de datos: si la API no está arriba, el corredor la levanta. Variantes y detalle de cada
suite: [`testing.md`](./testing.md) y [`e2e-playwright.md`](./e2e-playwright.md).

**Qué casos están automatizados:** 101 de los 102 casos del catálogo se validan con pruebas
automatizadas; el otro es una verificación manual registrada (TC-SEC-04). Para correr las
suites y ver el estado de cada caso:

```bash
node scripts/validate-test-cases.mjs
```

Resultado de la última validación: [`qa/validation-report.md`](./qa/validation-report.md).

---

## Parte 2 · Recorridos guiados paso a paso

Nueve recorridos que, juntos, tocan toda la plataforma. Cada uno arranca desde el estado
del seed (Parte 0). A mano toman unos 35 minutos; automatizados con Playwright, unos 20
segundos.

| Recorrido | Automatizado en |
|---|---|
| 1 · Alta, sesión y rutas protegidas | `e2e/tests/01-auth-navigation.spec.ts` |
| 2 · Inscribir al participante nuevo | Manual (usa un usuario recién registrado) |
| 3 · Registrar actividad con regla de FC | `e2e/tests/02-activity-upload.spec.ts` |
| 4 · Validar y rechazar como admin | `e2e/tests/03-admin-validation.spec.ts` |
| 5 · Pagos y resumen financiero | `e2e/tests/04-finance.spec.ts` |
| 6 · Varios retos activos a la vez | `e2e/tests/05-challenges-scoring.spec.ts` |
| 7 · Reglas de puntaje configurables | `e2e/tests/05-challenges-scoring.spec.ts` |
| 8 · Importación masiva desde archivo | `e2e/tests/06-import.spec.ts` |
| 9 · Importación desde Google Sheets | `e2e/tests/06-import.spec.ts` (estado sin configurar) |

### Recorrido 1 · Alta, sesión y rutas protegidas

1. Abre `http://localhost:3005/dashboard` **sin haber iniciado sesión**. Debe redirigir a
   `/login`.
2. En `/login`, entra con `ana@reto.local` / `ChangeMe123!`. Debe llegar a "Mi reto".
3. Comprueba que el encabezado muestra "Ana Constante · Participante" y **no** muestra las
   secciones de admin (Validar, Participantes, Importar, Retos).
4. Pulsa "Salir". Debe volver a `/login` y `/dashboard` volver a estar protegido.
5. Entra ahora con `admin@reto.local`. El encabezado debe mostrar las cuatro secciones de
   admin.
6. Abre `/register` en una ventana nueva y registra `qa+1@reto.local` con la contraseña
   `corta`. Debe rechazarla por política de contraseña.
7. Repite con `Secret123`. Debe crear la cuenta e iniciar sesión, mostrando "Sin reto
   activo" porque el usuario nuevo no participa en ningún reto.

*(Cubre TC-AUTH-01, 02, 04, 10 y TC-UI-01, 02.)*

### Recorrido 2 · Inscribir al participante nuevo

1. Como admin, entra a **Participantes**.
2. En "Agregar participante", pulsa "+ Inscribir" junto a `qa+1@reto.local`.
3. Verifica que aparece en la lista de inscritos con el estado "Debe 120 BOB".
4. Vuelve a la sesión de `qa+1@reto.local` y recarga: ahora debe ver el reto de mayo.

*(Cubre TC-PART-01 y TC-CHAL-06.)*

### Recorrido 3 · Registrar una actividad con la regla de frecuencia cardíaca

1. Como `qa+1@reto.local`, entra a **Subir actividad**.
2. Confirma que el encabezado dice "captura de FC con al menos 20 min de registro".
3. Elige una fecha dentro de mayo de 2026 que sea Lun–Sáb, duración 30, y escribe **15** en
   "Minutos con FC". El botón "Registrar actividad" debe quedar deshabilitado con el aviso
   de que el reto exige al menos 20 minutos.
4. Cambia a **25**. El aviso ahora debe pedir solo la captura de FC.
5. Adjunta una imagen en "Foto del entrenamiento" y otra en "Captura de frecuencia
   cardíaca". El botón debe habilitarse.
6. Pulsa "Registrar actividad". Debe volver a "Mi reto" con la actividad en estado
   PENDIENTE y la fecha exactamente igual a la que elegiste.
7. Intenta registrar otra actividad **el mismo día**: debe fallar con "Ya registraste una
   actividad para ese día".

*(Cubre TC-ACT-01, 02, 05, 13, 14, 18, TC-UP-02 y TC-UI-04.)*

### Recorrido 4 · Validar y rechazar como admin

1. Como admin, entra a **Validar**.
2. Localiza la actividad de `qa+1@reto.local`. Debe mostrar la insignia "Cumple FC", la
   duración, los minutos de FC y las dos fotos.
3. Pulsa "✓ Validar". La tarjeta desaparece de la lista.
4. Entra a **Ranking**: el participante debe sumar un día validado.
5. Vuelve a Validar y rechaza cualquier otra actividad pendiente escribiendo un motivo. El
   participante debe ver el motivo en su lista de actividades.

*(Cubre TC-ACT-08, 09, 10 y TC-RES-01.)*

### Recorrido 5 · Pagos y resumen financiero

1. Como admin, entra a **Participantes**.
2. Anota las cuatro tarjetas: Esperado, Recaudado, Pendiente y Presupuesto.
3. Pulsa "Marcar pagado" en un participante que deba. Las tarjetas deben actualizarse al
   instante y el chip pasar a "✓ Pagado 120 BOB".
4. Pulsa "Marcar impago" en el mismo. Las tarjetas deben volver al valor anterior.
5. Entra a **Ranking** y comprueba la línea de premio: monto por ganador, pote y la marca
   "proyectado" mientras el reto sigue activo.

*(Cubre TC-PART-04, TC-FIN-01, 02, 05 y TC-FIN-04.)*

### Recorrido 6 · Varios retos activos a la vez

1. Como admin, entra a **Retos** y crea uno nuevo para otro mes (por ejemplo diciembre
   2026) con días válidos solo sábado y domingo.
2. Pulsa "Activar" en el reto nuevo. El reto de mayo debe seguir activo.
3. Comprueba que en el encabezado aparece el **selector de reto** con las dos opciones.
4. Cambia al reto nuevo: "Mi reto", "Subir actividad" y "Ranking" deben mostrar sus datos
   (período, días válidos y mínimo de FC propios).
5. Recarga la página: la selección debe mantenerse.
6. Cierra el reto nuevo desde **Retos**. El selector debe desaparecer y la vista volver al
   reto de mayo.
7. Intenta activar el reto ya cerrado: debe mostrarse el error del servidor y el reto seguir
   cerrado.

*(Cubre TC-CHAL-04, 08, 10 y TC-CHAL-01.)*

### Recorrido 7 · Reglas de puntaje configurables

1. Como admin, entra a **Retos** y pulsa "+ Nuevo reto".
2. En el bloque "Reglas de puntaje", confirma los valores por defecto: 1 punto por día, 0
   por km, 0 días mínimos, 2 ganadores y desempate por sorteo.
3. Crea un reto con 10 puntos por día, 1 por km, mínimo 5 días, 1 ganador y desempate por
   kilómetros. Actívalo e inscribe a dos participantes.
4. Registra para uno de ellos dos actividades validadas y entra a **Ranking** con ese reto
   seleccionado.
5. Verifica: la línea que describe la regla, la columna **Puntos**, y la marca "no califica"
   en quien no llega a los 5 días.
6. Vuelve a seleccionar el reto de mayo: no debe aparecer la columna Puntos ni la línea de
   regla, porque usa los valores por defecto.

*(Cubre TC-SCORE-01, 02, 03 y 05.)*

### Recorrido 8 · Importación masiva desde archivo

1. Como admin, entra a **Importar**.
2. Descarga la plantilla en CSV y ábrela: debe traer las columnas de la plantilla, incluida
   `heartRateMinutes`.
3. Completa dos filas para el reto de mayo: una con `heartRateMinutes` y
   `hasHeartRateProof=true`, otra sin esos datos.
4. Sube el archivo y pulsa "Previsualizar". Ambas filas deben salir válidas, y la segunda
   con una advertencia que menciona el mínimo de FC.
5. Pulsa "Importar". El resumen debe indicar las filas creadas y los usuarios nuevos.
6. Entra a **Ranking** y comprueba que las actividades importadas cuentan.
7. Vuelve a importar el mismo archivo con la estrategia "Omitir": el resumen debe contarlas
   como omitidas.

*(Cubre TC-IMP-01, 02, 03 y TC-ACT-16.)*

### Recorrido 9 · Importación desde Google Sheets

1. Como admin, entra a **Importar** y baja hasta "3. Desde Google Sheets".
2. Si el backend **no** tiene configurada la integración, la sección debe estar
   deshabilitada explicando que faltan `GOOGLE_SERVICE_ACCOUNT_EMAIL` y `GOOGLE_PRIVATE_KEY`,
   y la carga por archivo debe seguir funcionando. Ahí termina el recorrido.
3. Con la integración configurada (ver [`import-template.md`](./import-template.md)), pega
   el identificador de la hoja y pulsa "Comprobar": debe mostrar título, hojas, rango y
   número de filas.
4. Pulsa "Previsualizar" y luego "Importar": el resultado debe ser idéntico al de la carga
   por archivo.

*(Cubre TC-IMP-05, 06 y 07.)*

---

## Parte 3 · Catálogo de casos

El catálogo se mantiene en [`qa/catalog.mjs`](./qa/catalog.mjs) y se publica, validado, en:

- [`qa/test-cases.md`](./qa/test-cases.md): cada caso con módulo, prioridad, tipo, paso de la
  guía, precondiciones, datos de prueba, pasos, resultado esperado y la tabla de pruebas que
  lo validan, con su resultado.
- [`qa/test-cases.csv`](./qa/test-cases.csv): la misma información para planillas (abre con
  acentos correctos en Excel).
- [`qa/validation-report.md`](./qa/validation-report.md): suites ejecutadas, casos por estado y
  prioridad, defectos encontrados y observaciones abiertas.

Los identificadores (`TC-AUTH-01`, `TC-ACT-15`…) se conservan de la versión anterior de este
documento, así que las referencias de los recorridos de la Parte 2 y de la guía siguen
valiendo. Para agregar o cambiar un caso, edita `catalog.mjs` y vuelve a correr el validador:
si el título de una prueba no coincide con su enlace, el caso queda como "Enlace roto" y el
comando falla.
