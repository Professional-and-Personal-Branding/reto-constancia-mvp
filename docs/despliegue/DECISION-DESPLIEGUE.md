# Decisión de despliegue: Reto de Constancia

**Fecha:** 2026-11-16. **Método:** 3 agentes defendieron una plataforma cada uno, 3 críticos atacaron cada propuesta comprobando sus supuestos contra la documentación oficial, 3 jueces con lentes distintas (costo, seguridad, operación) puntuaron y votaron, y un árbitro revisó el resultado. Profundidad: `normal` (9 agentes, unos 800.000 tokens). Estado del proyecto: **todavía no está desplegado**; el plan vigente (Seenode, ver [`../runbook-despliegue.md`](../runbook-despliegue.md)) entró como candidato «quedarse».

## Resultado

Gana **Seenode**, pero en una **variante de un solo Web Service** (API y web en el mismo contenedor) más PostgreSQL administrado y Cloudinary: el plan documentado hoy, con dos Web Services, cuesta 12 USD por mes y rompe el tope de 10. La variante cuesta **8 USD por mes** y pide tarjeta solo al terminar el período de prueba de 7 días. **La elección es condicional:** cuatro supuestos que sostienen restricciones duras no se pudieron verificar sin abrir una cuenta, y se cierran con el período de prueba (fase 1 del [runbook](RUNBOOK-DESPLIEGUE.md)) antes de comprometer dinero o datos.

Plan B: **VPS con Docker Compose**, si el período de prueba muestra que Seenode no ofrece PostgreSQL 16 o acceso externo a la base con control de origen. Ojo: el plan B también tiene un supuesto abierto (un VPS de 4 GB por 10 USD o menos que se pueda ordenar el día del alta).

| Criterio             | Peso | Por qué pesa                                           | Seenode (1 servicio) | VPS Docker |            Render |
| -------------------- | ---: | ------------------------------------------------------ | -------------------: | ---------: | ----------------: |
| Costo                |   20 | Tope de 10 USD por mes                                 |                 3,00 |       2,00 |              1,67 |
| Ajuste al stack      |   20 | Código Node/Postgres que debe correr con pocos cambios |                 2,00 |       2,67 |              1,67 |
| Seguridad            |   25 | Datos sensibles: hashes y comprobantes de pago         |                 2,33 |       3,33 |              2,00 |
| Operación            |   15 | Una sola persona al mando                              |                 3,33 |       2,00 |              2,00 |
| Reversibilidad       |   15 | Volver atrás y salir                                   |                 2,00 |       4,00 |              2,67 |
| Esfuerzo             |    5 | Menos peso: el proyecto no tiene prisa                 |                 3,00 |       1,67 |              3,33 |
| **Puntaje sobre 5**  |      |                                                        |             **2,53** |   **2,75** | **2,03** (vetado) |
| **Votos (Borda)**    |      |                                                        |                **6** |          3 |                 0 |
| **Primeros puestos** |      |                                                        |           **3 de 3** |     0 de 3 |            0 de 3 |

Pesos: seguridad 25 y esfuerzo 5 (datos sensibles); el resto, como la rúbrica.

## El proyecto, en lo que importa para desplegarlo

API NestJS 11 y web Next.js 15 con render en servidor, PostgreSQL 16 con migraciones versionadas (`prisma migrate deploy` al arrancar), proceso Node persistente, sin tareas programadas ni websockets. Las fotos van a Cloudinary con firma del servidor; el disco local solo se usa en desarrollo. Audiencia: decenas de usuarios por reto. Datos sensibles. La 1.15.0 trae la primera migración desde la 1.4.0, por eso el respaldo verificado con restauración (`scripts/db-backup.mjs`) es obligatorio antes de cada migración. Detalle y evidencia: [`perfil-despliegue.json`](perfil-despliegue.json).

## Restricciones

| Restricción dura                                                  | Resultado                                                                                                                                                                                                               |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hasta 10 USD por mes (Cloudinary gratis)                          | Seenode de 2 servicios (12 USD) la incumple; la variante de 1 servicio (8 USD) la cumple. Render la incumple con dos servicios siempre activos (unos 20 USD). El VPS la cumple solo si se puede ordenar el plan de 4 GB |
| Proceso Node persistente                                          | Render en plan gratuito la incumple (se duerme a los 15 minutos). Los tres jueces lo vetaron por esto y su propio proponente lo declaró                                                                                 |
| PostgreSQL 16                                                     | Seenode: **sin verificar** que ofrezca la versión 16                                                                                                                                                                    |
| Respaldo verificado con restauración antes de migrar              | Seenode: **sin verificar** el acceso externo a la base; el VPS lo cumple con ajustes al script                                                                                                                          |
| Vuelta atrás sin tocar el esquema; poder salir llevándose la base | Los tres la cumplen con `pg_dump` estándar                                                                                                                                                                              |
| Datos sensibles                                                   | Seenode: acceso externo a la base protegido solo por contraseña si no hay lista de IP                                                                                                                                   |

## Por qué ganó

- **Consenso total:** los 3 jueces la pusieron primera. Es la que menos piezas tiene (base administrada con 7 respaldos diarios, despliegue desde `main`) y la única que cabe en el tope sin condiciones ajenas al owner: la variante de 1 servicio cuesta 4 USD de aplicación + 4 USD de base.
- **El código encaja:** proceso persistente, sin disco en producción, `migrate deploy` ya en el arranque ([`backend/Dockerfile:42`](../../backend/Dockerfile)). Los cambios son pequeños: script de arranque, reescritura `/api/*` en Next y un `connection_limit` de Prisma por el tope de 20 conexiones.
- **Fuentes verificadas:** precios y respaldos, de https://seenode.com/pricing (Web Service Basic 4 USD con 0,5 GB y 0,2 CPU; PostgreSQL Basic 4 USD con 1 GB y 20 conexiones; trial de 7 días sin tarjeta).

## Por qué no los otros

- **VPS con Docker Compose:** quedó primero en puntaje ponderado (2,75 contra 2,53) por seguridad y reversibilidad, pero ningún juez lo puso primero. Su operación (parches, firewall, respaldos externos cifrados, dominio) es mucho trabajo para una persona, necesita un Dockerfile nuevo para la web, y el plan barato de 4 GB figuraba como no ordenable en las consultas de octubre de 2026.
- **Render:** vetado por mayoría de jueces y por su propia autodeclaración. Los dos servicios gratuitos se duermen a los 15 minutos; con ambos siempre activos más base cuesta unos 20 USD. Además, `migrate deploy` correría en cada arranque en frío sin respaldo.

## Arbitraje

El script marcó «requiere árbitro» por dos motivos: primero y segundo a menos de 0,25 puntos, y desacuerdo entre Borda y puntaje ponderado. **Decisión: Seenode.** Motivos:

1. El ganador por puntaje, el VPS, lo es por criterios (seguridad y reversibilidad) que se pueden **cubrir en Seenode con un cambio chico** (respaldo externo cifrado, lista de IP), mientras que lo que le falta al VPS (operación, esfuerzo) es trabajo permanente del owner.
2. Los tres jueces, con lentes distintas, pusieron primero a Seenode con reservas **idénticas**: la diferencia es verificar cuatro supuestos, no una preferencia. Verificarlos cuesta cero (trial sin tarjeta). Si fallan, Seenode se veta y el orden pasa a plan B sin votar de nuevo.
3. El puntaje del VPS depende de un plan de 4 GB que, según su propio proponente, hoy figura como no ordenable; la rúbrica limita a 3 el puntaje de un criterio que descansa en un supuesto, y no comprobé si los jueces lo aplicaron.

El único veto del panel fue el de Render. Una nota sobre el conteo: el script veta a quien declara `incumple`; aquí coincidió con el veto de los jueces, así que no distorsionó el resultado.

## Hallazgos que condicionan el diseño

| Hallazgo del crítico                                                                                                | Qué pasa a ser                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| El acceso público a la base para `db-backup.mjs` no está confirmado y, si existe, podría no admitir lista de IP     | Regla de corte 2 y verificación obligatoria en la fase 1                                                             |
| PostgreSQL 16 no confirmado                                                                                         | Regla de corte 1                                                                                                     |
| 0,5 GB de RAM, 0,2 CPU y 750 MB de disco para build, SSR, API y argon2                                              | Prueba de carga y de build en el trial (fase 1); si no alcanza, Standard (7 USD) lleva el total a 11 y rompe el tope |
| Límite de 5 intentos de login por minuto por IP: detrás de Next y del proxy de Seenode la API vería la IP del proxy | `TRUST_PROXY=2` (o el valor que corresponda) y prueba explícita con dos clientes                                     |
| «Mover `main` al tag» contradice el gitflow del proyecto (sin push forzado)                                         | La vuelta atrás es redesplegar el commit del tag anterior desde el panel, o un PR de revert a `main`                 |
| Un proceso que muere no reinicia al otro                                                                            | El script de arranque termina el contenedor si cualquiera de los dos cae                                             |

## Costos aceptados

- Un solo contenedor con dos procesos: un fallo de memoria tira API y web a la vez. Mitigación: supervisor que reinicia el servicio y comprobación de `/api/health` tras cada despliegue.
- Sin plan gratuito: si se agotan los créditos, el servicio se detiene. Mitigación: cargar saldo con margen y revisar el panel cada mes.
- Seenode es un proveedor chico y varias páginas de su documentación devolvieron 404 al panel; por eso la salida es estándar (`pg_dump`, Node 20, Docker).

## Supuestos que quedan abiertos y cómo se cubren

| Supuesto                                                   | Cobertura en el runbook                                           |
| ---------------------------------------------------------- | ----------------------------------------------------------------- |
| PostgreSQL 16                                              | Regla de corte 1, fase 1 fila 1                                   |
| Acceso externo con control de origen y respaldo verificado | Regla de corte 2, fase 1 filas 2 a 4                              |
| 0,5 GB de RAM y 0,2 CPU alcanzan                           | Regla de corte 3, fase 1 filas 5 y 6; solo se cierra con el trial |
| Reversión por redespliegue de un commit                    | Fase 1 fila 7, con alternativa (PR de revert); no corta           |
| El trial no pide tarjeta                                   | Fase 1 fila 8; regla de corte 4                                   |
| Repositorio público (hoy) sin secretos                     | Fase 0 punto 4 y `scan-secrets.mjs` en la CI                      |

## Disenso

Los tres jueces pusieron primero a Seenode «con reservas»: costo (el colchón es de 2 USD), seguridad («el menos malo, no el probado»: base abierta a internet solo con contraseña si no hay lista de IP) y operación (casi todo lo que sostiene las restricciones duras es supuesto). Riesgos que quedan abiertos hasta cerrar la fase 1: acceso externo a la base, versión 16, recursos del plan Basic y reversión por redespliegue.

## Cambios de código que el despliegue necesita

No se aplican todavía: son un cambio OpenSpec que el owner debe aprobar (spec primero, ver `CLAUDE.md`).

- [ ] `scripts/start-prod.sh`: `prisma migrate deploy`, API en `127.0.0.1:3001`, Next en `0.0.0.0:3000`, y salida del contenedor si uno de los dos muere.
- [ ] `frontend/next.config.mjs`: reescritura `/api/:path*` → `http://127.0.0.1:3001/api/:path*` y `NEXT_PUBLIC_API_URL=/api`; revisar llamadas del lado servidor.
- [ ] Un solo comando de build que compile backend y frontend con memoria acotada (`NODE_OPTIONS=--max-old-space-size`).
- [ ] `connection_limit=5` en `DATABASE_URL`; `TRUST_PROXY` según la cadena de proxies.
- [ ] Actualizar `docs/deploy-seenode.md` y el runbook §1, §2, §4 y §5.1 con la variante de un servicio.

## Qué reabriría esta decisión

- Cualquiera de las reglas de corte 1 a 3 del runbook.
- Un precio de Seenode distinto de los 4 USD de cada pieza, o la necesidad de pasar a Standard.
- Más de unas decenas de usuarios simultáneos o fotos que dejen de caber en Cloudinary gratuito.
- Que el plan de 4 GB del VPS sea ordenable a 10 USD o menos y el owner prefiera control total.
