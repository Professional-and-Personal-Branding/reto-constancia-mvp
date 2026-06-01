# Gitflow del proyecto

Modelo de ramas para mantener `main` siempre desplegable.

## Ramas principales

| Rama | Propósito | Despliega a |
|---|---|---|
| `main` | Código estable y liberable. Solo recibe merges desde `release/*` o `hotfix/*`. | Producción |
| `develop` | Integración continua de features terminadas. | Staging |

## Ramas de apoyo

| Prefijo | Nace de | Mergea a | Uso |
|---|---|---|---|
| `feature/*` | `develop` | `develop` | Nuevas funcionalidades (ej. `feature/bulk-import`) |
| `fix/*` | `develop` | `develop` | Correcciones no urgentes |
| `release/*` | `develop` | `main` + `develop` | Preparar una versión (bump, changelog, QA) |
| `hotfix/*` | `main` | `main` + `develop` | Arreglo urgente en producción |

## Flujo típico de una feature

```bash
git checkout develop
git pull
git checkout -b feature/mi-funcionalidad
# ...trabajo + commits...
git push -u origin feature/mi-funcionalidad
# Abrir PR hacia develop. Requiere: CI verde (lint + build + test) y 1 review.
```

## Convención de commits

Se usa Conventional Commits:

- `feat:` nueva funcionalidad
- `fix:` corrección de bug
- `chore:` mantenimiento (deps, config)
- `docs:` documentación
- `test:` pruebas
- `refactor:` refactor sin cambio funcional
- `ci:` pipeline

Ejemplo: `feat(import): carga masiva de participantes desde CSV/XLSX`

## Reglas

- Nunca commits directos a `main`.
- `develop` y `main` protegidas: merge solo vía PR con CI verde.
- Una feature = una rama = un PR pequeño y revisable.
