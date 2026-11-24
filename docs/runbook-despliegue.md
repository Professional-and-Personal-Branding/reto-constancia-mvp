# Runbook de despliegue — Reto de Constancia

Procedimiento operativo para poner la plataforma en producción, publicar versiones nuevas,
revertir y atender incidentes. El detalle de cada pantalla de Seenode está en
[`deploy-seenode.md`](./deploy-seenode.md); aquí está el orden, los controles y las decisiones.

| | |
|---|---|
| **Versión de referencia** | `v1.15.0` (tag sobre `main`) |
| **Plataforma** | Seenode: **un** Web Service (API NestJS y web Next.js en el mismo contenedor, `npm run build` / `npm start`) + PostgreSQL administrado; Cloudinary para fotos. El esquema de dos servicios queda en el [Apéndice A](#apéndice-a-despliegue-en-dos-servicios-alternativa) |
| **Servicio único desde** | El código del supervisor (`scripts/start-prod.mjs`, `package.json` de la raíz) llega con la release 1.16.0 (objetivo); antes de ella solo existe el esquema del Apéndice A |
| **Rama que se despliega** | `main` (solo llega por PR de `release/*`, ver `gitflow.md`) |
| **Duración estimada** | Primer despliegue: 60–90 min. Versión nueva: 15–20 min |
| **Quién** | Responsable del despliegue (ejecuta) y administrador del reto (verifica la app) |

> Desde la 1.3.0 (NestJS 11) el build instala `xlsx` desde `cdn.sheetjs.com` y la API
> valida `JWT_*_EXPIRES_IN` al arrancar. Ambos puntos están cubiertos en los pasos de abajo.
>
> Camino por omisión: **un solo servicio** (cambio OpenSpec `single-service-deploy`). La validación
> previa en el período de prueba de Seenode (fase 1: PostgreSQL 16, acceso externo a la base, recursos
> reales) está en [`despliegue/RUNBOOK-DESPLIEGUE.md`](./despliegue/RUNBOOK-DESPLIEGUE.md); mientras no
> esté registrada, lo marcado «pendiente de medir en la fase 1» es un supuesto, no una medición de Seenode.

---

## 0. Antes de empezar (todas las veces)

Sin estos puntos en verde **no se despliega**.

- [ ] El commit a desplegar es un tag `vX.Y.Z` sobre `main` y su CI está en verde
      (Backend, Frontend y E2E de UI).
- [ ] Batería local en verde sobre ese commit, desde una base reiniciada:
  ```bash
  cd backend && npx prisma migrate reset --force
  cd .. && node scripts/run-tests.mjs              # todos los pasos OK
  node scripts/validate-test-cases.mjs              # todos los casos aprobados
  ```
- [ ] `npm audit --omit=dev` sin avisos en `backend/` y `frontend/`. Es el único audit que
      bloquea: `npm audit` completo en `frontend/` muestra avisos conocidos de herramientas de
      desarrollo (`braces` por Tailwind 3 y el plugin de ESLint de Next.js) que no llegan al
      servidor; están registrados en `docs/testing.md` §5.
- [ ] Leída la sección de la versión en `CHANGELOG.md`, en especial **Cambiado** y
      **Antes de desplegar** del PR de release: variables nuevas, migraciones, cambios de
      comportamiento.
- [ ] Hay ventana acordada con el administrador del reto (idealmente fuera del horario en que
      los participantes suben su actividad del día).
- [ ] Respaldo verificado con `node scripts/db-backup.mjs` (`OK`) si la versión trae migraciones (ver §5.1).

---

## 1. Primer despliegue (una sola vez)

### 1.1 Cuentas y secretos

- [ ] Cuenta de Seenode con GitHub autorizado sobre el repositorio.
- [ ] Cuenta de Cloudinary: `cloud name`, `api key`, `api secret`. En **Settings → Security**
      activa **"Allow delivery of PDF and ZIP files"**: las cuentas nuevas la traen apagada y sin
      ella un comprobante en PDF responde 401 al abrirlo.
- [ ] Dos secretos JWT **distintos**, generados al azar:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
  ```
- [ ] Contraseña fuerte para el administrador inicial (`SEED_ADMIN_PASSWORD`).
- [ ] Guarda todo en el gestor de secretos del equipo, nunca en el repositorio ni en chats.

### 1.2 Base de datos

1. Seenode → **Databases** → **Create database** → PostgreSQL.
2. Elige **PostgreSQL 16** (pendiente de confirmar en la fase 1 que Seenode lo ofrece).
3. Copia la connection string de **red privada** y agrégale el límite de conexiones del pool de Prisma:
   `...?schema=public&connection_limit=5`. PostgreSQL Basic admite 20 conexiones y hacen falta
   para `migrate deploy`, los respaldos y tu `psql`; sin `connection_limit` el supervisor avisa en los
   Logs (sin imprimir la cadena).
4. Activa los respaldos automáticos del plan, si el tier los ofrece.

**Control:** la cadena apunta a la red privada, no a la pública, y trae `connection_limit=5`.

### 1.3 Servicio único (Web Service que corre API y web)

Un solo Web Service ejecuta el supervisor `scripts/start-prod.mjs` (`npm start`): aplica
`prisma migrate deploy`, arranca la API en `127.0.0.1:3001` (solo loopback), espera su
`/api/health`, arranca Next en `0.0.0.0:3000` y **termina el contenedor si cualquiera de los dos
procesos muere**, para que la plataforma lo reinicie. El navegador habla con un solo origen: Next
reenvía `/api/*` a la API.

| Campo | Valor |
|---|---|
| Rama | `main` |
| Root Directory | la raíz del repositorio (vacío o `/`) |
| Node | 20 o 22 (el `package.json` de la raíz exige `>=20 <23`) |
| Build Command | `npm run build` |
| Start Command | `npm start` |
| Port | `3000` |
| Health check | `/api/health` (atraviesa Next y la API: falla si cualquiera cae; no `/api/health/db`: reiniciar no arregla una base caída) |

`npm run build` (`scripts/build-prod.mjs`) instala con `npm ci`, compila la API y después la web,
en secuencia y con el heap acotado (`BUILD_MAX_OLD_SPACE_MB`, por omisión 400), elimina las
dependencias de desarrollo e imprime el tamaño de `backend/` y `frontend/`. El build fija solo
`NEXT_PUBLIC_API_URL=/api` y `API_INTERNAL_URL=http://127.0.0.1:<API_PORT>` si no las defines;
ambas se incrustan al compilar: **si cambian (o cambia `API_PORT`) hay que volver a compilar**, no
alcanza con reiniciar.

Variables (ver la referencia completa en §7):

- **Obligatorias:** `NODE_ENV=production`, `DATABASE_URL` (con `connection_limit=5`, §1.2), `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN=15m`, `JWT_REFRESH_EXPIRES_IN=7d`, `API_PREFIX=api`, `PORT=3000`, `CORS_ORIGIN` (la URL de la aplicación, sin barra final), `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_FOLDER=reto-constancia`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`.
- **Variable de BUILD:** `NEXT_PUBLIC_API_URL=/api` (relativa: el navegador llama al mismo origen). Márcala como variable de build en el panel; el script ya la usa por omisión, definirla la deja explícita.
- **`TRUST_PROXY`:** por omisión el supervisor la fija en `1` (el borde de Seenode es el salto de confianza; Next reenvía `X-Forwarded-For` sin añadir el suyo). El valor definitivo se confirma en la fase 1 con la comprobación de dos redes (fase 5, fila 6 de `despliegue/RUNBOOK-DESPLIEGUE.md`): pendiente de medir en la fase 1. Si Seenode pusiera otro proxy delante, el valor es el número de saltos, sin cambio de código.
- **Opcionales de memoria:** `API_MAX_OLD_SPACE_MB` (224), `WEB_MAX_OLD_SPACE_MB` (160), `BUILD_MAX_OLD_SPACE_MB` (400), `API_PORT` (3001). Sirven para reajustar sin tocar código cuando se mida la memoria real (fase 1 de `despliegue/RUNBOOK-DESPLIEGUE.md`).
- **`SWAGGER_ENABLED`:** se deja sin definir (Swagger apagado en producción).
- No definas `HOST`: el supervisor ya lo pone en `127.0.0.1` para la API.

**Controles:**

- [ ] El build termina sin errores y el log final muestra los tamaños de `backend/` y `frontend/`.
      Si falla al instalar `xlsx`, el servidor de build no llega a `cdn.sheetjs.com` (ver §6). Si se
      queda sin memoria, ver §6 (build).
- [ ] Los logs del arranque muestran `migrate deploy` sin migraciones pendientes, la API sana y
      luego la web escuchando; sin la advertencia de `connection_limit`.
- [ ] `https://<servicio>/api/health` responde `{"status":"ok",…}` (pasa por Next y la API).
- [ ] `https://<servicio>/api/health/db` responde 200 con `"db":"up"` (con la base caída responde 503).
- [ ] Un monitor externo gratuito (UptimeRobot, Better Stack o similar) consulta
      `https://<servicio>/api/health/db` cada 5 minutos: espera 200 y avisa con 503.
- [ ] Al redesplegar, los Logs muestran "Conexión a la base cerrada" y el supervisor sale con 0.
      Si un proceso muere, el log dice cuál y con qué código, y el servicio se reinicia solo.

### 1.4 y 1.5 Conectar y crear el administrador

1. `CORS_ORIGIN` debe ser la URL del servicio (`https://<servicio>`, sin barra final). Con un solo
   origen el navegador no hace llamadas entre dominios, pero la API sigue exigiéndola en producción.
   Si la cargaste después de crear el servicio, redeploy.
2. Shell del servicio → crear el administrador:
   ```bash
   cd backend && npm run seed:prod
   ```
   En producción el seed **solo** crea el administrador y falla si falta
   `SEED_ADMIN_PASSWORD`. Nunca uses `SEED_DEMO=true` en producción. `seed:prod` es el seed
   compilado a JavaScript y corre con `node`: `npx prisma db seed` no sirve en el servicio único
   porque `ts-node` es una dependencia de desarrollo y el build la elimina (`npm prune --omit=dev`).
3. Entra a la web con `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, abre **Mi cuenta** y cambia la
   contraseña por una nueva, guardada en el gestor de secretos del equipo. Después **borra
   `SEED_ADMIN_PASSWORD` del servicio** (no hace falta redesplegar). Motivo: el seed
   sobrescribe la contraseña de un administrador que ya existe, así que un `npm run seed:prod`
   posterior por descuido revertiría la rotación; sin la variable, el seed falla en producción.
4. **Si pierdes la contraseña del administrador** (no hay recuperación por correo): define una
   `SEED_ADMIN_PASSWORD` temporal en el servicio, ejecuta `cd backend && npm run seed:prod` desde su shell,
   entra con ella, rótala en **Mi cuenta** y borra la variable otra vez. El seed cambia el hash,
   así que también cierra las sesiones anteriores del administrador. Si otro administrador sigue
   pudiendo entrar, puede entregarte una contraseña temporal desde **Usuarios** (o, hasta entonces, con
   `POST /api/users/:id/reset-password` desde `curl`); la ruta del seed queda para cuando ningún
   administrador puede entrar.

### 1.6 Verificación del primer despliegue

Haz la prueba de humo de §3 completa y además:

- [ ] `node scripts/single-service-smoke.mjs $BASE --skip-limit` (con `BASE=https://<servicio>`) termina con `OK`
      (sin `--skip-limit` termina con `FALLO` solo en la comprobación del límite de login, ver abajo) y con `PASS` en todas las demás:
      comprueba la web, `/api/health`, `/api/health/db`, Swagger apagado, una ruta protegida sin
      sesión y las cabeceras de seguridad. Los tres casos finales (límite de login con
      `X-Forwarded-For` falsos) están pensados para hablar directo con Next: detrás del borde de
      Seenode todas las peticiones salen de tu misma IP, así que se espera que termine con FALLO en exactamente esa
      comprobación («otro cliente no comparte el límite») y todas las demás en PASS; `--skip-limit` omite esos tres
      casos (el resumen dice cuántos se omitieron y que el límite NO se verificó) y evita dejar tu IP en 429 ( qué hace exactamente el borde con la cabecera
      está pendiente de medir en la fase 1). La prueba válida del límite en Seenode son las dos redes
      de la fase 5, fila 6, de `despliegue/RUNBOOK-DESPLIEGUE.md`. El script solo usa una cuenta
      inexistente; sin `--skip-limit` deja tu IP en 429 de login durante un minuto: espera antes de entrar como
      administrador.
- [ ] La contraseña del administrador ya no es `SEED_ADMIN_PASSWORD`: **Mi cuenta** muestra al
      administrador, entrar con la contraseña vieja del seed responde "Credenciales inválidas" y
      `SEED_ADMIN_PASSWORD` ya no está definida en el servicio.
- [ ] Ningún usuario de demo en la base: `SELECT email FROM "User";` no trae `@reto.local`.
- [ ] Subir una foto desde "Subir actividad": si Cloudinary falta, la subida queda
      deshabilitada a propósito.
- [ ] **Verificaciones de subidas en la cuenta real (V1 a V5).** Condicionan abrir la URL a los
      participantes, no la fusión del código. Con un participante inscrito en un reto activo:
  - **V1:** la foto de actividad acepta JPG, PNG, WEBP y HEIC, y rechaza PDF y GIF con
        "Formato no permitido…".
  - **V2:** una foto `.jpeg` se sube y su URL termina en `.jpg`. Si no, agregar `jpeg` a los
        formatos (`backend/src/upload/upload-policy.ts`).
  - **V3:** un comprobante en PDF se sube y se abre desde Admin → Participantes. Si no se abre
        con la entrega de PDF activada, aplicar el plan B del cambio `upload-guardrails`
        (comprobantes solo como imagen).
  - **V4:** alterar `allowed_formats` o `folder` en la subida (DevTools) responde
        "Invalid Signature".
  - **V5:** en Cloudinary → Media Library, el `public_id` de lo subido empieza con
        `reto-constancia/<reto>/<usuario>/activity/` (o `payment-proof/`). Si la cuenta usa
        *dynamic folders* y el prefijo no aparece, aplicar el fallback del diseño
        (`asset_folder` con `use_asset_folder_as_public_id_prefix`).
- [ ] Dos usuarios desde redes distintas no comparten el límite de firmas: si uno llega al 429
      de `/api/upload/sign` y el otro también, revisar `TRUST_PROXY` (por omisión `1`, valor a confirmar
      en la fase 1).
- [ ] Recorridos 1, 3, 4 y 5 de la Parte 2 de `docs/test-cases.md` contra el entorno real.

---

## 2. Publicar una versión nueva

Una versión llega a producción cuando su PR de release se fusiona en `main`. Seenode
redespliega al recibir el push.

1. **Preparación** (§0 completo sobre el tag nuevo).
2. **Variables primero:** si el CHANGELOG pide variables nuevas o distintas, cárgalas en
   Seenode **antes** de fusionar. Una variable faltante puede impedir el arranque.
3. **Fusionar** el PR `release/X.Y.Z` → `main` y crear el tag `vX.Y.Z` sobre el commit de merge.
4. **Un solo redeploy:** el servicio único compila y arranca API y web del mismo commit, y el
   supervisor levanta la web solo cuando la API ya responde, así que no hay orden que respetar ni
   una web nueva hablando con una API vieja. Espera a que el panel muestre el despliegue terminado y
   a que `/api/health` y `/api/health/db` respondan `ok`. Si cambia una variable de BUILD
   (`NEXT_PUBLIC_API_URL`, `API_INTERNAL_URL`) o `API_PORT`, el redeploy ya recompila. (En el
   esquema de dos servicios, API primero y web después: Apéndice A.)
5. **Prueba de humo** (§3).
6. **Back-merge** `release/X.Y.Z` → `develop` y registro de la versión (§8).

**Versión con «Mi cuenta»:** no trae migraciones ni variables nuevas, pero cambia el contenido del
refresh token: tras desplegarla, cada usuario vuelve a iniciar sesión una vez (su primera
renovación de sesión responde 401 y la web lo envía al login). API y web van juntas (con el servicio
único es automático): la web espera que `PATCH /api/users/me/password` responda 200 con tokens.
Avisa a los participantes. Si es el primer despliegue, sigue el paso 3 de §1.4.

**Migraciones:** se aplican solas en el arranque, antes de la API (el supervisor corre `prisma migrate deploy` y no arranca nada si falla). Son
solo hacia adelante. Si la versión trae alguna, corre el respaldo verificado de §5.1 y despliega solo con `OK`, antes del paso 3. **La 1.15.0 trae una migración** (historial de rechazos, ver §4): sin respaldo verificado con `OK` no se despliega.

---

## 3. Prueba de humo (5 minutos)

```bash
BASE=https://<servicio>                  # un solo origen: la web y la API (/api)
API=$BASE/api
curl -s $API/health                     # {"status":"ok",...}
curl -s $API/health/db                  # {"status":"ok","db":"up"}
curl -s -o /dev/null -w "%{http_code}\n" $API/auth/me     # 401: sin sesión no entra
```

En la web, con el administrador:

- [ ] Login y logout (y que una ruta privada sin sesión redirija a `/login`).
- [ ] "Mi reto" muestra el reto activo, la cuenta regresiva y las métricas.
- [ ] Ranking del reto activo y, si existe, un reto cerrado desde "Retos cerrados".
- [ ] Retos, Participantes, Validar e Importar abren sin errores.
- [ ] El interruptor de modo claro/oscuro cambia el tema.
- [ ] La consola del navegador no muestra errores de CORS.
- [ ] `$BASE/api/docs` responde 404 (Swagger apagado en producción) y las respuestas de la API
      traen la cabecera `X-Request-Id`.
- [ ] `curl -sI $BASE/` trae `strict-transport-security`, `x-frame-options`, `x-content-type-options`,
      `referrer-policy` y `content-security-policy`, y no trae `x-powered-by`.

Con la sesión de un participante (privacidad, desde la 1.4.2):

- [ ] El Ranking muestra nombres sin emails y la fila propia dice "(tú)".
- [ ] "Mi reto" muestra el estado de pago propio en el comprobante.
- [ ] Con su token, `GET $API/challenges/active/list` no trae la clave `participants` en
      ningún reto y `me` solo tiene `paid, paidAt, amountPaid, paymentProofUrl,
      paymentProofUploadedAt, joinedAt`; `GET $API/challenges/<id>/participants` responde 403.

Si algo falla: §4 (revertir) o §6 (diagnóstico).

---

## 4. Revertir

**Cuándo:** la prueba de humo falla en algo que bloquea a los usuarios (login, subir
actividad, validar) y no se corrige en minutos.

1. En Seenode, vuelve a desplegar el **commit del tag anterior** en el servicio único: es un solo
   redeploy y API y web vuelven juntas, sin orden que cuidar. (Pendiente de medir en la fase 1: que el
   panel permita redesplegar un commit concreto.) Si la plataforma solo despliega desde la rama, crea un
   PR que revierta el merge en `main` (`git revert -m 1 <merge>`) y fusiónalo.
   **Antes de la primera versión con servicio único (1.16.0, objetivo) el repositorio no tiene el
   `package.json` de la raíz ni el supervisor:** `npm run build` y `npm start` no existen en esos
   commits. Cambiar los comandos del panel no basta para volver a una versión anterior al supervisor (1.15.0 o
   anterior): el [Apéndice A](#apéndice-a-despliegue-en-dos-servicios-alternativa) son **dos** Web
   Services (un segundo servicio para la web, `NEXT_PUBLIC_API_URL` absoluta y `CORS_ORIGIN` con la URL
   de la web, 12 USD/mes), y con un solo Web Service no se puede correr la 1.15.0 ni la 1.14.0. Para
   volver a ellas hay que crear el segundo servicio y cambiar `CORS_ORIGIN` y la URL de la API (con su
   tiempo y costo adicional) o bien arreglar hacia adelante con un PR de corrección. Si el servicio
   único ya corre una versión con supervisor, vuelve a un tag que también lo tenga.
2. **Si la versión aplicó migraciones:** el código anterior puede no funcionar con el esquema
   nuevo. Opciones, en este orden:
   1. Si la migración solo **agrega** columnas o tablas, el código anterior suele funcionar:
      verifica con la prueba de humo.
   2. Si no, restaura el respaldo de §5.1 (se pierde lo escrito desde el respaldo) **y**
      despliega el código anterior.
3. Repite la prueba de humo sobre la versión anterior.
4. Avisa al administrador del reto y registra el incidente (§8).

En la lista por versión de abajo, «API y web juntas» ya es automático con el servicio único (un solo
redeploy); la regla sigue importando en el esquema de dos servicios (Apéndice A).

Las versiones 1.0.0 → 1.3.0 no tienen migraciones nuevas entre sí, así que revertir entre
ellas es solo volver a desplegar el código. **La 1.4.0 trae una migración** (presupuesto
automático: `budgetTotal` pasa a ser opcional): toma el respaldo de §5.1 antes de desplegarla.
Para volver de la 1.4.0 a la 1.3.0 hay que restaurar ese respaldo, porque la 1.3.0 no entiende
un presupuesto vacío. La 1.4.1 y la 1.4.2 no traen migraciones: volver entre ellas y la 1.4.0
es solo volver a desplegar el código (API y web juntas, porque la 1.4.2 cambia lo que la API
entrega a los participantes). La 1.5.0 tampoco trae migraciones; para volver a la 1.4.2 se
despliegan API y web juntas, porque cambia el contrato de subida, y el Start Command con `exec`
sigue sirviendo. La 1.6.0 no trae migraciones: volver a la 1.5.0 es solo redesplegar la API (la
web no cambia). Los premios guardados por el sorteo automático quedan en la base como premiación
normal. La 1.7.0 tampoco trae migraciones; para volver a la 1.6.0 se despliegan API y web juntas,
porque la web usa el nuevo resumen previo al cierre. Los archivos que la 1.7.0 ya liberó no
vuelven: sus actividades ya estaban borradas. La 1.8.0 tampoco trae migraciones; para volver a la
1.7.0 se despliegan API y web juntas, porque la web llama al endpoint nuevo del acta. La 1.9.0 tampoco trae
migraciones; para volver a la 1.8.0 se despliegan API y web juntas, porque la web usa `paymentStatus` y los
campos nuevos de finanzas. La 1.10.0 tampoco trae migraciones; para volver a la 1.9.0 se despliegan API y web
juntas, porque la web usa el endpoint `GET /activities/me/calendar`. La 1.11.0 tampoco trae migraciones; para
volver a la 1.10.0 se despliegan API y web juntas, porque la web usa `renewal-preview`, `renew` y
`participants/bulk`, y la API cambia el retiro de actividades rechazadas.
La 1.12.0 (con «Mi cuenta») tampoco trae migraciones: para volver a la 1.11.0 se despliegan API y web juntas. Los refresh tokens que emite llevan un dato extra que la anterior ignora, así que las sesiones sobreviven a la reversión; las contraseñas cambiadas mientras tanto quedan cambiadas (son hashes normales).
La 1.12.1 (endurece la renovación y la inscripción en bloque) tampoco trae migraciones ni variables: para volver a la 1.12.0 se despliegan API y web juntas; no cambia ningún contrato.
La 1.13.0 (chequeo de sesión efectivo, «Mi avance», pagos en lote y reinicio de contraseña por el admin) tampoco trae migraciones ni variables: para volver a la 1.12.1 se despliegan API y web juntas. Las sesiones sobreviven a la reversión (los refresh tokens ya llevaban `pwv` desde la 1.12.0); una contraseña temporal emitida mientras tanto sigue siendo un hash normal, y la web de la 1.12.1 no tiene la página Usuarios ni las casillas de pago.
La 1.14.0 (revocación instantánea de access tokens, filtros de la cola de validación, respaldo verificado, modal de cierre y login sin filtración por latencia) tampoco trae migraciones ni variables: para volver a la 1.13.0 se despliegan API y web juntas. Los access tokens emitidos con la 1.14.0 llevan `pwv` y la 1.13.0 los ignora, así que las sesiones sobreviven a la reversión.

**La 1.15.0 (reenviar una actividad rechazada) trae una migración** (`add_activity_rejection_history`: la tabla `ActivityRejection` y la columna `DailyActivity.resubmissionCount`, solo agrega y trae un relleno idempotente de los rechazos existentes). No se despliega sin un respaldo verificado de §5.1 con `OK`. Para volver a la 1.14.0 **no hace falta restaurar el respaldo**: se redespliega la 1.14.0 y el esquema se queda como está. Ojo: la 1.14.0 es anterior al supervisor, así que desde el servicio único eso exige crear el segundo servicio del Apéndice A y cambiar `CORS_ORIGIN` y la URL de la API (ver §4, paso 1), o arreglar hacia adelante; en el esquema de dos servicios se despliegan API y web juntas. El cliente de Prisma de la 1.14.0 selecciona columnas explícitas (ignora `resubmissionCount`), nunca lee la tabla nueva, y sus borrados de actividades se propagan por la llave foránea con `ON DELETE CASCADE`. Mientras corre la 1.14.0 los rechazos no se anotan en el historial (y la 1.14.0 aún puede rechazar de nuevo una actividad rechazada y sobrescribir su motivo); el contador de reenvíos no crece; nada se rompe. **Al volver a desplegar la 1.15.0** `migrate deploy` ve la migración ya aplicada y no la repite, así que los rechazos hechos durante la reversión no tienen entrada: en cuanto la API esté arriba, y después del respaldo de §5.1, corre desde `backend/` con la `DATABASE_URL` de producción el relleno de recuperación `npx prisma db execute --file prisma/sql/backfill-activity-rejections.sql` (solo agrega los pares `(actividad, motivo vigente)` que faltan; si no falta ninguno, no inserta nada, y puedes repetirlo). Los motivos que la 1.14.0 sobrescribió con un nuevo rechazo no se recuperan. Quitar el esquema por completo es opcional y solo después de volver al código anterior: `DROP TABLE "ActivityRejection"; ALTER TABLE "DailyActivity" DROP COLUMN "resubmissionCount";` y borrar la fila de la migración en `_prisma_migrations`; restaurar el respaldo no es parte de una reversión y perdería lo escrito desde entonces.

---

## 5. Datos

### 5.1 Respaldo verificado antes de migraciones

`scripts/db-backup.mjs` vuelca la base, restaura el volcado en una base temporal local
(`reto_restore_check_*`, que borra al terminar) y compara las filas de cada tabla con el origen.
Solo lee el origen. Usa `pg_dump`, `pg_restore` y `psql` del PATH y, si no están, el contenedor
`reto-constancia-db`.

**Cuándo:** antes de cada despliegue cuyas notas de versión listen una migración, y una vez al mes.
**Un despliegue con migración no se hace sin un `OK`.**

**Cómo (Windows, este proyecto):**

```powershell
docker compose up -d postgres
$env:DATABASE_URL = '<url de producción>'; node scripts/db-backup.mjs; Remove-Item Env:DATABASE_URL
```

En Git Bash: `DATABASE_URL='<url>' node scripts/db-backup.mjs`. Escribe `backups/reto-AAAAMMDD-HHMM.dump`
(carpeta ignorada por git). Si la base solo es alcanzable desde la shell del servicio, haz el volcado
allí (`pg_dump "$DATABASE_URL" --format=custom --file=reto.dump`), descárgalo y verifícalo con
`node scripts/db-backup.mjs --file reto.dump`: termina con `OK (sin comparación con el origen)`,
una prueba más débil (compara a ojo un par de cuentas con las pantallas del admin).

**Resultado:** `OK` (código 0) permite desplegar. `FALLO` (código 1; el volcado queda como
`*.unverified.dump`) no: repite el respaldo; "la base cambió durante el respaldo" se arregla
repitiéndolo en un momento sin actividad. Código 2: el script se negó (destino no local, falta
Docker o el cliente es más viejo que el servidor); el mensaje dice qué hacer.

**Dónde guardarlo:** el `.dump` contiene datos personales (nombres, correos, pagos): fuera del
repositorio y de Seenode, en una carpeta cifrada del dueño; nunca en incidencias ni chats.

**Cuántos:** los últimos 3 verificados, más el previo a cada release con migración hasta confirmar
la siguiente; el resto se borra a mano (el script nunca borra).

**Restaurar** (comando manual, ahora con un archivo verificado):

```bash
pg_restore --clean --if-exists --no-owner --dbname "$DATABASE_URL" reto-AAAAMMDD-HHMM.dump
```

### 5.2 Nunca en producción

- `npx prisma migrate reset` (borra la base).
- `npx prisma migrate dev` (crea migraciones contra la base de producción).
- `SEED_DEMO=true` (crea usuarios con contraseña conocida).

### 5.3 Mantenimiento mensual del almacenamiento

Desde 1.7 la API libera sola las fotos de una actividad retirada o borrada (después de guardar el
cambio y sin afectar la respuesta). Los comprobantes de pago reemplazados se conservan, porque son
evidencia financiera, salvo que se active `UPLOAD_DELETE_REPLACED_PROOFS=true`. Si un borrado
falla, los Logs muestran `No se pudo borrar el archivo <id>` y el archivo queda huérfano.

Una vez al mes:

1. Cloudinary → Dashboard: revisar el uso del plan. **Al pasar el 70 %**, hacer el paso 2 esa
   misma semana (no esperar al mes siguiente).
2. Generar el reporte de huérfanos desde una máquina con las variables de la API (solo lee):

   ```bash
   DATABASE_URL=... CLOUDINARY_CLOUD_NAME=... CLOUDINARY_API_KEY=... CLOUDINARY_API_SECRET=... node scripts/cloudinary-orphans.mjs
   ```

   Lista los archivos que ninguna foto ni comprobante usa, con categoría (`activity`,
   `payment-proof` o `legacy`), fecha, tamaño total y el uso del plan. Sin credenciales sale con
   código 1.
3. Decidir a mano: borrar desde la Media Library de Cloudinary las fotos huérfanas (`activity`).
   Los `payment-proof` y `legacy` se revisan uno por uno antes de borrar; ante la duda, se
   conservan. El reporte no tiene opción de borrado.

### 5.4 Acta mensual del reto cerrado

Después de cerrar cada reto, exporta su acta: es la copia del resultado que queda fuera de
Seenode (quién participó, quién pagó, quién ganó y el premio). No reemplaza el respaldo de §5.1.

1. En la web, entra a **Ranking**, elige el reto en **Retos cerrados** y pulsa
   **Descargar acta (CSV)**. Se descarga `acta-reto-AAAA-MM.csv`.
2. Guárdala en un lugar privado (Drive personal o similar): trae emails y montos pagados.
3. Si Excel la abre en una sola columna, usa **Datos > Desde texto/CSV**, codificación UTF-8 y
   coma como separador. Google Sheets la abre bien con **Archivo > Importar**.

Por la API: `GET /api/challenges/:id/export?format=csv` con sesión de administrador. Solo
funciona con retos cerrados (400 en cualquier otro estado) y no modifica nada.

---

## 6. Diagnóstico de incidentes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| El build falla instalando `xlsx` | Sin salida a `cdn.sheetjs.com` | Permitir el dominio en el build; reintentar |
| El build se corta sin mensaje o con "heap out of memory" | Memoria del builder (0,5 GB): pendiente de medir en la fase 1 | Ver el último paso impreso por `build-prod.mjs`; ajustar `BUILD_MAX_OLD_SPACE_MB` (400 por omisión) y reintentar |
| El build falla con `nest: not found` o un error de `tailwindcss`/`typescript` | Si el panel aplica `NODE_ENV=production` también al build, `npm ci` omite las dependencias de desarrollo (pendiente de comprobar en la fase 1) | Dejar `NODE_ENV=production` solo para el arranque; si el panel no lo permite, avisar para ajustar `build-prod.mjs` (p. ej. `npm ci --include=dev`) |
| El build pasa pero el servicio no arranca: "Falta el build" | Se arrancó sin compilar o el build corrió en otro directorio | Redeploy con Build Command `npm run build` y Root Directory = la raíz del repositorio |
| `/api/*` responde 502 o 404 desde la web | La web se compiló con otro `API_PORT` o sin `API_INTERNAL_URL` | Cuando el puerto cambia entre build y arranque, el supervisor lo advierte en los Logs; volver a compilar con el mismo `API_PORT` |
| El servicio se reinicia en bucle | Un proceso muere (el supervisor termina el contenedor a propósito) | Buscar en los Logs "el proceso api/web terminó" con su código; memoria agotada: ajustar `API_MAX_OLD_SPACE_MB` / `WEB_MAX_OLD_SPACE_MB` o pasar de plan |
| La API no arranca: "`JWT_…_EXPIRES_IN` no es una duración válida" | Valor mal escrito | Usar `900`, `15m`, `12h` o `7d` y redeploy |
| La API no arranca: error de Prisma o `migrate deploy` | `DATABASE_URL` mal o base caída | Revisar la cadena (red privada) y `/api/health/db` |
| `/api/health` ok pero `/api/health/db` responde 503 | Base caída o sin red privada | Estado de la base en Seenode; reintentar conexión. La línea `ERROR [HTTP]` de los Logs trae la hora exacta |
| Un usuario reporta un error con un código | Error inesperado en la API (500) | Buscar el código en Logs: la línea `ERROR [HTTP]` con ese `requestId` trae la ruta y el detalle |
| `/api/docs` responde 404 | Swagger apagado en producción (por diseño) | `SWAGGER_ENABLED=true` solo mientras se necesite, y redeploy |
| La web carga pero toda llamada falla con CORS | `CORS_ORIGIN` distinto a la URL exacta de la web | Corregir (sin barra final) y redeploy de la API |
| La web llama a una API equivocada | `NEXT_PUBLIC_API_URL` mal en el **build** (en el servicio único debe ser `/api`) | Corregir y **recompilar** |
| Muchos usuarios reciben 429 a la vez | La API no ve la IP real: todos comparten el cupo | `TRUST_PROXY=1` (por omisión del supervisor); solo si Seenode pone otro proxy delante, el número de saltos (se confirma en la fase 1) |
| Un cliente evade el límite de login con `X-Forwarded-For` falso | `TRUST_PROXY` mayor a los saltos reales | Bajarlo a `1` y repetir la comprobación de dos redes (fase 5, fila 6, de `despliegue/RUNBOOK-DESPLIEGUE.md`) |
| "Subir actividad" deshabilitado | Faltan variables `CLOUDINARY_*` | Cargarlas y redeploy |
| Subir responde "No participas en este reto" | El usuario no está inscrito en el reto seleccionado | Inscribirlo en Participantes; solo los inscritos pueden subir |
| Subir responde "Formato no permitido…" | Formato fuera de la lista (actividad: JPG, PNG, WEBP, HEIC; comprobante: además PDF) | Esperado; convertir el archivo |
| El comprobante en PDF responde 401 al abrirlo | Entrega de PDF apagada en Cloudinary | Settings → Security → "Allow delivery of PDF and ZIP files" |
| Logs con "No se pudo borrar el archivo …" | Cloudinary no respondió al liberar una foto retirada | El usuario no se ve afectado; el archivo sale en el reporte mensual de huérfanos (§5.3) |
| Muchos 429 al subir fotos | Límite de firmas por minuto o `TRUST_PROXY` mal configurado | Revisar `TRUST_PROXY`; subir `UPLOAD_SIGN_LIMIT` si hace falta |
| Editar un reto responde "No se puede modificar un reto cerrado" | El reto ya está cerrado: su resultado es definitivo | Esperado desde 1.3: no se edita ni se reabre; la premiación sí se puede registrar |
| Registrar un pago responde "No se puede modificar un reto cerrado" | El reto ya está cerrado: no acepta pagos ni comprobantes | Esperado: el pago tardío se registra en el reto siguiente |
| Login responde 429 | 5 intentos por minuto por IP (protección anti fuerza bruta) | Esperar un minuto |
| La sesión se cierra sola | Refresh token rechazado (secretos JWT rotados) | Esperado tras rotar secretos: volver a iniciar sesión |
| Importar desde Google Sheets dice "no configurado" | Faltan `GOOGLE_*` | Opcional: ver `docs/import-template.md` |

Cada reinicio de contraseña hecho por un admin deja una línea `[Audit]` con
`"event":"admin_password_reset"`, `actorId` (quién) y `targetId` (a quién), nunca la contraseña.
Para ubicarla, busca `admin_password_reset` en Logs; su `requestId` es el mismo de la línea `[HTTP]`
de esa petición (hora, ruta `/api/users/:id/reset-password`, estado y duración).

Logs: panel de Seenode → servicio → Logs. Cada petición deja una línea `[HTTP]` en JSON con
`requestId`, método, ruta, estado, duración y usuario (nunca contraseñas ni tokens). Cada error
5xx deja además una línea `ERROR [HTTP]` con el mismo `requestId`; las alertas se configuran
sobre `ERROR`. La respuesta de toda petición trae el código en la cabecera `X-Request-Id`.

---

## 7. Variables de entorno

### API

| Variable | Obligatoria | Ejemplo | Notas |
|---|---|---|---|
| `NODE_ENV` | Sí | `production` | Activa las protecciones de producción |
| `DATABASE_URL` | Sí | `postgresql://…/reto?schema=public&connection_limit=5` | Red privada; `connection_limit=5` por el tope de 20 conexiones de PostgreSQL Basic (el supervisor avisa si falta) |
| `PORT` | Sí | `3000` | Igual al campo Port del servicio. En el servicio único es el puerto de la web (Next); la API escucha en `API_PORT` |
| `API_PREFIX` | Sí | `api` | |
| `CORS_ORIGIN` | Sí | `https://reto-app.seenode.app` | La URL de la aplicación, sin barra final; admite varias separadas por coma |
| `JWT_SECRET` | Sí | (48 bytes aleatorios) | Distinto del de refresh |
| `JWT_REFRESH_SECRET` | Sí | (48 bytes aleatorios) | Rotarlo cierra todas las sesiones |
| `JWT_ACCESS_EXPIRES_IN` | Sí | `15m` | Duración válida o el arranque falla |
| `JWT_REFRESH_EXPIRES_IN` | Sí | `7d` | Ídem |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | Sí | | Sin ellas no hay subida de fotos |
| `CLOUDINARY_FOLDER` | No | `reto-constancia` | |
| `SEED_ADMIN_EMAIL` / `_PASSWORD` / `_NAME` | Solo para el primer seed o para recuperar el acceso | | Se borra `SEED_ADMIN_PASSWORD` tras cambiar la contraseña en Mi cuenta (§1.4) |
| `TRUST_PROXY` | No | `1` | Por defecto 1 (en el servicio único lo fija el supervisor si falta); `false` si no hay proxy |
| `THROTTLE_LIMIT` / `THROTTLE_TTL_MS` | No | `100` / `60000` | Límite global por usuario |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` / `GOOGLE_SHEETS_DEFAULT_RANGE` | No | | Importación desde Google Sheets |
| `SWAGGER_ENABLED` | No | `false` | Sin definir: apagado en producción; `true` publica `/api/docs` |
| `PUBLIC_URL` | No | `https://reto-api.seenode.app` | URL pública de los archivos en el modo local de subidas (sin Cloudinary) |
| `UPLOAD_SIGN_LIMIT` | No | `30` | Firmas de subida por cliente y minuto |
| `UPLOAD_MAX_BYTES` | No | `10485760` | Tamaño máximo que la web valida antes de subir (10 MB) |
| `UPLOAD_DELETE_REPLACED_PROOFS` | No | `false` | `true` borra el comprobante anterior al reemplazarlo; por defecto se conserva como evidencia (§5.3) |

### Web

| Variable | Obligatoria | Ejemplo | Notas |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Sí | `/api` (servicio único) | **Variable de BUILD**: se incrusta al compilar. En dos servicios es la URL absoluta de la API (Apéndice A) |
| `API_INTERNAL_URL` | No | `http://127.0.0.1:3001` | **Variable de BUILD**: activa el reenvío `/api/*` de Next a la API. `build-prod.mjs` la fija por omisión con `API_PORT`; sin ella no hay reenvío (desarrollo y dos servicios) |

### Servicio único (supervisor y build)

Todas opcionales: sin ellas rigen los valores por omisión.

| Variable | Por omisión | Notas |
|---|---|---|
| `HOST` | `127.0.0.1` para la API (la fija el supervisor) | Interfaz en la que escucha la API. Sin definir y fuera del supervisor, escucha en todas. No la definas en el panel |
| `API_PORT` | `3001` | Puerto de la API en loopback. Debe ser el mismo al compilar y al arrancar |
| `API_MAX_OLD_SPACE_MB` | `224` | Tope del heap de la API. Retocar según la memoria medida en la fase 1 |
| `WEB_MAX_OLD_SPACE_MB` | `160` | Tope del heap de Next. Ídem |
| `BUILD_MAX_OLD_SPACE_MB` | `400` | Tope del heap en cada paso del build |
| `TRUST_PROXY` | `1` (la fija el supervisor si falta) | Saltos de proxy de confianza delante de la API: el borde de Seenode. Otro valor solo si la fase 1 mide otro número de saltos |

---

## 8. Registro

Después de cada despliegue, anota en `docs/testing.md` (Registro de ejecuciones) o en el
canal del equipo:

- versión y commit desplegados, fecha y hora;
- resultado de la prueba de humo;
- incidencias y si hubo reversión.

---

## Apéndice A. Despliegue en dos servicios (alternativa)

Esquema anterior: un Web Service para la API y otro para la web. **No es el camino por omisión**:
cuesta 12 USD por mes en Seenode (4 + 4 + 4 de la base) y supera el tope de 10 de la decisión
(`despliegue/DECISION-DESPLIEGUE.md`). Se conserva para las versiones anteriores al supervisor
(§4), para una plataforma sin límite de servicios y como respaldo si la fase 1 rechaza el servicio
único. El mismo commit sirve para ambos esquemas: todo lo nuevo del servicio único se activa solo por
variables. Las variables, los secretos (§1.1), la base (§1.2, con `connection_limit=5`), el seed y la
prueba de humo (§3) son los mismos, con estas diferencias.

### A.1 API (Web Service `backend`)

| Campo | Valor |
|---|---|
| Rama | `main` |
| Root Directory | `backend` |
| Node | 20 o 22 (el proyecto exige `>=20 <23`) |
| Build Command | `npm install && npx prisma generate && npm run build` |
| Start Command | `npx prisma migrate deploy && exec node dist/main.js` |
| Port | `3000` |
| Health check | `/api/health` (no `/api/health/db`) |

Variables: las de la API de §7. `CORS_ORIGIN` = la URL de la web (`https://<web>`, sin barra final);
se completa cuando existe la web y se redespliega la API. Controles: los de §1.3 contra
`https://<api>/api/health` y `https://<api>/api/health/db`; el `exec` del Start Command hace que, al
redesplegar, los Logs muestren "Conexión a la base cerrada".

### A.2 Web (Web Service `frontend`)

| Campo | Valor |
|---|---|
| Rama | `main` |
| Root Directory | `frontend` |
| Build Command | `npm install && npm run build` |
| Start Command | `npx next start -p 3000` |
| Port | `3000` |
| Variable de BUILD | `NEXT_PUBLIC_API_URL=https://<api>/api` (sin `API_INTERNAL_URL`: no hay reenvío) |

Si cambia `NEXT_PUBLIC_API_URL` hay que volver a compilar. El seed se ejecuta desde la shell del
servicio API (`npx prisma db seed`, sin `cd backend`; ahí `npm install` conserva `ts-node`).

### A.3 Diferencias de operación

- **Orden de despliegue (§2):** API primero; espera a que `/api/health` y `/api/health/db` respondan
  `ok`; web después, para que la web nueva no hable con una API vieja. Si Seenode despliega ambos a la
  vez, espera a que terminen los dos antes de verificar.
- **Reversión (§4):** vuelve a desplegar el commit del tag anterior en **ambos** servicios (API
  primero); las versiones que piden «API y web juntas» exigen los dos redeploys.
- **Prueba de humo (§3):** `API=https://<api>/api`; con la web en otro origen la consola no debe
  mostrar errores de CORS. Aquí `/api/docs` se consulta en `https://<api>/api/docs`.
- **Cabeceras y `TRUST_PROXY`:** los límites de login no pasan por Next, así que rige el valor por
  defecto de producción (`1`, el proxy de la plataforma); si hay dos proxies, `2`.
