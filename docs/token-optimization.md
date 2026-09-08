# Optimización de tokens en Claude Code: `rtk` + `headroom`

Guía para reproducir en **cualquier proyecto** la configuración que usamos aquí.
Ambas herramientas se instalan **una sola vez por máquina** (configuración global
del usuario); no requieren cambios en los repos.

| Herramienta | Qué hace | Dónde actúa |
|---|---|---|
| `rtk` (Rust Token Killer) | Reescribe los comandos `Bash` del agente a equivalentes `rtk …` que comprimen la salida (git, tests, builds, docker…) antes de que entre al contexto | Hook `PreToolUse` en `~/.claude/settings.json` |
| `headroom` (headroom-ai) | Proxy local que comprime el contexto (tool outputs, logs, JSON, diffs) de forma reversible antes de enviarlo al modelo | `ANTHROPIC_BASE_URL` → `http://127.0.0.1:8787` |

## 1. rtk (Windows)

```powershell
# 1) Binario oficial (GitHub Releases de rtk-ai/rtk) en ~/.local/bin
gh release download --repo rtk-ai/rtk --pattern 'rtk-x86_64-pc-windows-msvc.zip' --dir $env:TEMP\rtk --clobber
Expand-Archive -Force "$env:TEMP\rtk\rtk-x86_64-pc-windows-msvc.zip" "$env:TEMP\rtk\out"
New-Item -ItemType Directory -Force "$env:USERPROFILE\.local\bin" | Out-Null
Copy-Item "$env:TEMP\rtk\out\rtk.exe" "$env:USERPROFILE\.local\bin\rtk.exe" -Force

# 2) PATH de usuario (persistente)
$b = "$env:USERPROFILE\.local\bin"
$p = [Environment]::GetEnvironmentVariable("Path","User")
if ($p -notlike "*$b*") { [Environment]::SetEnvironmentVariable("Path", "$p;$b", "User") }

# 3) Hook global para Claude Code (rtk imprime el JSON si no puede escribirlo solo)
rtk init -g
```

En macOS/Linux: `curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/main/install.sh | sh` y luego `rtk init -g`.

Si `rtk init -g` pide un paso manual, el hook es este (se agrega a `~/.claude/settings.json`):

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "type": "command", "command": "rtk hook claude" }] }
    ]
  }
}
```

Verificación: en una sesión nueva, un `git status` debe aparecer reescrito como `rtk git status`.

**Limitaciones conocidas**
- Solo intercepta la herramienta `Bash`. `Read`/`Grep`/`Glob` no pasan por rtk; para
  aprovecharlo, pedir al agente lecturas dirigidas por shell (`rtk read`, `rtk grep`).
- Comandos complejos con *heredocs* (`cat <<'EOF'`) pueden romperse al reescribirse.
  Para crear archivos, usar la herramienta `Write`/`Edit` del agente en vez de heredocs.
- Instalar ripgrep (`winget install BurntSushi.ripgrep.MSVC`) evita avisos de rtk.
- Filtros globales opcionales: `%APPDATA%\rtk\filters.toml`.

## 2. headroom (proxy de compresión de contexto)

```bash
pip install --upgrade "headroom-ai[all]"   # CLI + proxy (Python)
headroom init -g claude                    # hooks durables + ANTHROPIC_BASE_URL en ~/.claude/settings.json
headroom install start --profile init-user # arranca el proxy persistente (puerto 8787)
headroom doctor                            # diagnóstico: proxy, enrutamiento, ahorros
```

Lo que `headroom init -g claude` deja en `~/.claude/settings.json`:
- `env.ANTHROPIC_BASE_URL = http://127.0.0.1:8787` (todas las sesiones CLI pasan por el proxy).
- Hooks `SessionStart` y `PreToolUse` que ejecutan `headroom init hook ensure` para
  levantar el proxy si no está corriendo.

Comandos útiles: `headroom install status|stop|restart --profile init-user`,
`headroom inspect` (original vs comprimido), `headroom dashboard` (ahorros),
`headroom unwrap claude` / `headroom install remove --profile init-user` (revertir).

Modo por defecto `cache` (compresión solo del *delta* nuevo, respeta el prefix cache);
`--mode token` maximiza ahorro a costa de romper caché. Reserva buffer de salida con
`headroom_output_buffer_tokens` y protege turnos recientes con `headroom_keep_turns`.

**Limitaciones conocidas (headroom 0.37)**
- **Claude Desktop (pestaña Code / agente local) no pasa por el proxy**: la app
  sobrescribe `ANTHROPIC_BASE_URL` (issue #869 de headroom). Solo las sesiones de
  la **CLI `claude` en terminal** quedan enrutadas. Una sesión ya abierta tampoco se
  puede reenrutar; hay que abrir una nueva.
- Remote Control y la carga bajo demanda de herramientas dependen de la base URL
  (issues #746 y #1158); para sesiones que necesiten Remote Control, ejecutar
  `claude` sin el proxy (`ANTHROPIC_BASE_URL=` vacío para esa sesión).
- Si el proxy está caído, la CLI no conecta: `headroom doctor` lo detecta y
  `headroom install start --profile init-user` lo levanta.

## 3. Uso en la librería (apps propias, no en Claude Code)

`headroom-ai` también existe como SDK TypeScript para pipelines LLM propios:

```ts
import { compress } from "headroom-ai";
const result = await compress(messages, { model: "claude-fable-5-1", tokenBudget: 32000 });
```

## 4. Reglas operativas para el agente (aplican en todos los proyectos)

1. Lecturas dirigidas (grep/glob por símbolo o archivo); nunca volcar archivos enteros.
2. `rtk`/shell comprimido para git, tests y builds.
3. Dejar que `headroom` comprima tool outputs; mantener intactas instrucciones y specs.
4. Resúmenes cortos entre iteraciones; el detalle vive en `openspec/`.
