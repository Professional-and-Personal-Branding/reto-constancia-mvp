# Documentación técnica — Reto de Constancia

Documentación de arquitectura, modelo de datos y flujos de la plataforma del
reto mensual de constancia. Complementa:
- `docs/test-cases.md` — casos de prueba paso a paso.
- `docs/challenge-rules.md` — reglas configurables y variabilidad mes a mes.
- `docs/security-owasp.md` — controles de seguridad.
- `docs/deploy-seenode.md` — despliegue.

## 1. Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind, TanStack Query |
| Backend | NestJS 10, TypeScript |
| ORM / BD | Prisma 5 + PostgreSQL 16 |
| Auth | JWT (access+refresh), Argon2, Passport |
| Archivos | Cloudinary (prod) · simulador local en disco (dev) |
| Seguridad | Helmet, CORS, Throttler (rate limit), class-validator |
| Infra | Seenode (2 web services + Postgres administrado) |

## 2. Contexto del sistema

```mermaid
flowchart TB
  participante["Participante"] -->|navegador| fe
  admin["Administrador"] -->|navegador| fe
  subgraph cliente["Frontend (Next.js :3005)"]
    fe["UI + TanStack Query"]
  end
  subgraph servidor["Backend (NestJS :3002, prefijo /api)"]
    api["REST API + JWT + RBAC"]
  end
  fe -->|"HTTPS /api (Bearer JWT)"| api
  api -->|Prisma| db[("PostgreSQL")]
  fe -.->|"upload directo firmado"| cloud["Cloudinary / simulador local"]
  api -->|firma de subida| cloud
```

## 3. Módulos del backend

```mermaid
flowchart LR
  app["AppModule"] --> auth["AuthModule<br/>(register/login/refresh/me)"]
  app --> challenges["ChallengesModule<br/>(retos, participantes, pagos, premios, resultados)"]
  app --> activities["ActivitiesModule<br/>(registro y validación)"]
  app --> upload["UploadModule<br/>(firma + simulador local)"]
  app --> importm["ImportModule<br/>(carga masiva CSV/XLSX)"]
  app --> health["HealthModule<br/>(liveness/readiness)"]
  app --> prisma["PrismaModule"]
  auth --> prisma
  challenges --> prisma
  activities --> prisma
  activities --> challenges
  importm --> prisma
  health --> prisma
```

Guards transversales: `JwtAuthGuard` (autenticación) y `RolesGuard` + `@Roles(ADMIN)`
(autorización). Pipeline de cada request:

```mermaid
flowchart LR
  req["Request"] --> helmet["Helmet"] --> cors["CORS"] --> throttle["Throttler<br/>(rate limit)"]
  throttle --> jwt["JwtAuthGuard"] --> roles["RolesGuard"] --> valid["ValidationPipe<br/>(DTO whitelist)"]
  valid --> ctrl["Controller → Service → Prisma"]
```

## 4. Modelo de datos

```mermaid
erDiagram
  User ||--o{ ChallengeParticipant : participa
  User ||--o{ DailyActivity : registra
  User ||--o{ ChallengeAward : recibe
  Challenge ||--o{ ChallengeParticipant : tiene
  Challenge ||--o{ DailyActivity : agrupa
  Challenge ||--o{ ChallengeAward : otorga
  DailyActivity ||--o{ ActivityPhoto : adjunta

  User {
    uuid id PK
    string email UK
    string passwordHash
    string name
    enum role "PARTICIPANT|ADMIN"
    bool active
  }
  Challenge {
    uuid id PK
    int month
    int year
    date startDate
    date endDate
    int[] validDays
    int minHeartRateMinutes
    decimal feePerParticipant
    decimal budgetTotal
    string currency
    enum status "DRAFT|ACTIVE|COMPLETED"
    int pointsPerValidatedDay "regla de puntaje"
    decimal pointsPerKm
    int minValidatedDaysToQualify
    int maxWinners
    enum tiebreakRule "DRAW|TOTAL_KM|SHARE_ALL"
  }
  ChallengeParticipant {
    uuid id PK
    bool paid
    decimal amountPaid
    string paymentProofUrl
  }
  DailyActivity {
    uuid id PK
    date date
    enum exerciseType
    int durationMinutes
    decimal distanceKm
    int avgHeartRate
    int heartRateMinutes "minutos de FC según la captura"
    bool hasHeartRateProof
    enum status "PENDING|VALIDATED|REJECTED"
    string rejectionReason
    string validationNote "nota del admin al validar con override"
  }
  ChallengeAward {
    uuid id PK
    string notes
    datetime awardedAt
  }
  ActivityPhoto {
    uuid id PK
    string url
    string cloudinaryId
    enum type "ACTIVITY|HEART_RATE|METRICS"
  }
```

Restricciones clave:
- `Challenge` único por `(month, year)`.
- `ChallengeParticipant` único por `(challengeId, userId)`.
- `DailyActivity` única por `(challengeId, userId, date)` → 1 actividad por día.
- `ChallengeAward` único por `(challengeId, userId)`.

## 5. Estados

```mermaid
stateDiagram-v2
  direction LR
  state Challenge {
    [*] --> DRAFT
    DRAFT --> ACTIVE: activate (admin)
    ACTIVE --> ACTIVE: activate (idempotente)
    ACTIVE --> COMPLETED: close / awards
    DRAFT --> COMPLETED: close
    COMPLETED --> [*]: no se reactiva (400)
  }
```

Varios retos pueden estar `ACTIVE` a la vez (spec `challenge-lifecycle`).
`GET /challenges/active/list` devuelve todos los activos (más reciente primero,
con `isParticipant`); `GET /challenges/active` devuelve el reto "por defecto"
del usuario (el más reciente donde participa, si no el más reciente activo).
La web muestra un selector de reto en el encabezado cuando hay más de uno.

```mermaid
stateDiagram-v2
  direction LR
  state DailyActivity {
    [*] --> PENDING: participante registra
    PENDING --> VALIDATED: admin valida
    PENDING --> REJECTED: admin rechaza (con motivo)
    REJECTED --> VALIDATED: admin re-valida
  }
```

## 6. Flujo de autenticación

```mermaid
sequenceDiagram
  participant U as Usuario
  participant FE as Frontend
  participant API as API (Auth)
  participant DB as Postgres
  U->>FE: email + password
  FE->>API: POST /auth/login
  API->>DB: busca user por email
  API->>API: argon2.verify(hash, password)
  API-->>FE: { user, tokens:{access,refresh} }
  FE->>FE: guarda tokens (localStorage)
  Note over FE,API: Cada request lleva Authorization: Bearer access
  FE->>API: GET /... (access)
  API-->>FE: 401 si expiró
  FE->>API: POST /auth/refresh (refresh)
  API-->>FE: nuevos tokens (auto-refresh transparente)
```

## 7. Flujo principal: actividad → validación → resultados

```mermaid
sequenceDiagram
  participant P as Participante
  participant FE as Frontend
  participant API as API
  participant CL as Cloudinary/local
  participant A as Admin

  P->>FE: subir actividad (foto + datos)
  FE->>API: POST /upload/sign
  API-->>FE: firma + uploadUrl
  FE->>CL: sube archivo (directo)
  CL-->>FE: secure_url, public_id
  FE->>API: POST /activities (challengeId, fecha, fotos)
  API->>API: valida activo + participante + período + día válido + 1/día + foto
  API->>API: regla FC: heartRateMinutes >= minHeartRateMinutes y foto HEART_RATE (400 si no cumple)
  API-->>FE: actividad PENDING

  A->>API: GET /activities/pending
  A->>API: POST /activities/:id/validate (o /reject)
  Note over A,API: si la actividad no cumple la regla de FC: 400 salvo { override: true, note } (queda en validationNote)
  API-->>A: VALIDATED / REJECTED

  Note over API: ResultsService recalcula ranking
  P->>API: GET /challenges/:id/results
  API-->>P: ranking, ganadores, empates, notas
```

## 8. Flujo de premiación

```mermaid
sequenceDiagram
  participant A as Admin
  participant API as API (Challenges/Results)
  A->>API: GET /challenges/:id/results
  API-->>A: ranking + ganador(es) sugerido(s)
  A->>API: POST /challenges/:id/awards { userIds, notes }
  API->>API: valida que sean participantes
  API->>API: status = COMPLETED, registra ChallengeAward
  API-->>A: premiados (prevalecen sobre el cálculo automático)
```

Reglas de ganador (en `ResultsService`, ver detalle y gaps en `docs/challenge-rules.md`):
1 tope → gana solo · 2 empate → ambos (dividen) · 3+ → sorteo de 2 · 0 → sin ganador.

## 9. Importación masiva

```mermaid
flowchart LR
  tmpl["GET /import/template<br/>(CSV/XLSX)"] --> sheet["Llenar en Google Sheets/Excel"]
  sheet --> prev["POST /import/activities/preview<br/>(dry-run, valida filas)"]
  prev --> commit["POST /import/activities/commit<br/>(crea users/participantes/actividades)"]
  commit --> db[("Postgres")]
```

Idempotente según `duplicateStrategy` (`skip`/`update`); estado por defecto y password
temporal configurables. Detalle en `docs/import-template.md`.

## 10. Carga de archivos (dos modos)

```mermaid
flowchart TB
  subgraph dev["Dev (sin credenciales)"]
    s1["/upload/sign → uploadUrl local"] --> l1["/api/upload/local (multipart)"]
    l1 --> disk["backend/uploads/*"] --> serve["GET /uploads/* (estático)"]
  end
  subgraph prod["Prod (Cloudinary)"]
    s2["/upload/sign → firma real"] --> c2["api.cloudinary.com/.../upload"]
    c2 --> cdn["secure_url CDN"]
  end
```

El backend detecta el modo en el arranque: si faltan `CLOUDINARY_*`, activa el
simulador local; el frontend usa el mismo cliente (`lib/cloudinary.ts`) sin cambios.

## 11. Despliegue (producción)

```mermaid
flowchart LR
  user["Navegador"] -->|HTTPS| fe["Seenode Web: Next.js<br/>root: frontend"]
  fe -->|"NEXT_PUBLIC_API_URL /api"| be["Seenode Web: NestJS<br/>root: backend"]
  be -->|red privada| pg[("Seenode PostgreSQL")]
  be --> cloud["Cloudinary"]
```

Comandos, variables y pasos: `docs/deploy-seenode.md`. Migraciones con
`prisma migrate deploy` en el arranque; healthcheck `/api/health`.

## 12. Endpoints (resumen)

| Área | Endpoint | Rol |
|---|---|---|
| Auth | `POST /auth/register` · `POST /auth/login` · `POST /auth/refresh` · `GET /auth/me` | público / autenticado |
| Retos | `POST /challenges` · `PATCH /challenges/:id` · `:id/activate` · `:id/close` · `:id/awards` · `GET :id/finance` | ADMIN |
| Retos | `GET /challenges` · `GET /challenges/active` · `GET /challenges/active/list` · `GET /challenges/:id` · `:id/results` · `:id/participants` | autenticado |
| Participantes | `POST/DELETE /challenges/:id/participants...` · `PATCH .../payment` | ADMIN |
| Pagos | `PATCH /challenges/:id/participants/me/payment-proof` | participante |
| Actividades | `POST /activities` · `GET /activities/me` · `DELETE /activities/:id` | autenticado |
| Actividades | `GET /activities` · `GET /activities/pending` · `:id/validate` · `:id/reject` | ADMIN |
| Upload | `POST /upload/sign` · `POST /upload/local` (dev) | autenticado / público(dev) |
| Import | `GET /import/template` · `POST /import/activities/preview` · `/commit` · `GET /import/sheet/status` · `POST /import/sheet/preview` · `/commit` | ADMIN |
| Health | `GET /health` · `GET /health/db` | público |
