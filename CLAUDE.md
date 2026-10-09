## Modelos por tipo de trabajo

- Diseño, specs, ADRs, decisiones y preguntas al owner → agente `arquitecto` (Claude Opus 5.5,
  `claude-opus-5-5`).
- Implementación, tests, archivado y cierre de PRs → agente `implementador` (Claude Sonnet 5.5,
  `claude-sonnet-5-5`).
- La sesión principal orquesta: reparte el trabajo, revisa diffs, resuelve conflictos e integra.
- Si una tarea mezcla ambos, primero `arquitecto` (spec y decisiones) y después `implementador`.
- Para cambiar de versión de modelo en el futuro, se actualiza el `model:` de ambos agentes y esta
  sección en el mismo PR.

## Evitar trabajo redundante y gasto de tokens

Cada petición vuelve a enviar toda la conversación: el costo crece con el número de turnos y con lo
que se repite.

- **No repetir lo ya establecido.** Una decisión del owner, el resultado de un comando o el contenido
  de un archivo ya leído no se vuelve a derivar, leer ni preguntar. Una decisión tomada no se reabre.
- **Una verificación que pasó no se repite** hasta que cambie el código. Durante la iteración se corre
  solo lo afectado (la prueba o el archivo tocado); la batería completa (`node scripts/run-tests.mjs`) y
  el validador del catálogo, una sola vez antes de abrir el PR.
- **Lecturas dirigidas:** grep/glob y rangos de líneas en vez de archivos enteros; no releer un archivo
  recién editado (la herramienta ya falla si el cambio no se aplicó); las búsquedas amplias en muchos
  archivos van a un agente `Explore`, que devuelve la conclusión y no los archivos.
- **Agrupar:** las llamadas independientes (lecturas, búsquedas, ediciones a archivos distintos) van en
  el mismo turno. Los comandos largos se lanzan una vez en segundo plano y se espera su aviso, sin
  sondear con `sleep`.
- **Salida acotada:** `| tail`, `--quiet` o `rtk`; nunca volcar logs completos al contexto.
- **Reutilizar agentes:** continuar uno ya lanzado con `SendMessage` en vez de crear otro con el mismo
  contexto repetido; no delegar lo que se resuelve con una lectura o una búsqueda directa.
- **Sin pasadas no pedidas:** nada de documentación extra, formateo de archivos antiguos, refactors ni
  changelogs que la tarea no pidió.
- **Recomendar, no listar:** ante varias salidas se da una recomendación con su porqué, no un
  inventario de opciones que no se van a seguir.
- Las herramientas de compresión (`rtk`, `headroom`) están en `docs/token-optimization.md`.
