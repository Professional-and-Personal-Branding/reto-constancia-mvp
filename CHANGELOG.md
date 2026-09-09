# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Versionado [SemVer](https://semver.org/lang/es/).

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
