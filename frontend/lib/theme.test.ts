/**
 * Pruebas del tema claro/oscuro: resolución del tema, script previo a la hidratación y
 * contraste de las paletas definidas en app/globals.css. Sin framework: `node:test`.
 *   npm test
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { resolveTheme, THEME_INIT_SCRIPT, THEME_KEY } from './theme.ts';

test('sin elección guardada sigue al sistema; sin preferencia del sistema queda oscuro', () => {
  assert.equal(resolveTheme(null, true), 'light');
  assert.equal(resolveTheme(null, false), 'dark');
});

test('la elección guardada manda sobre el sistema', () => {
  assert.equal(resolveTheme('dark', true), 'dark');
  assert.equal(resolveTheme('light', false), 'light');
});

test('un valor guardado inválido se ignora', () => {
  assert.equal(resolveTheme('sepia', true), 'light');
  assert.equal(resolveTheme('', false), 'dark');
});

/** Ejecuta el script previo a la hidratación con un navegador simulado. */
function runInitScript(stored: string | null, systemPrefersLight: boolean, storageThrows = false) {
  const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string> };
  const window = {
    localStorage: {
      getItem: (key: string) => {
        if (storageThrows) throw new Error('bloqueado');
        return key === THEME_KEY ? stored : null;
      },
    },
    matchMedia: (query: string) => ({ matches: query.includes('light') && systemPrefersLight }),
  };
  new Function('window', 'document', 'localStorage', 'matchMedia', THEME_INIT_SCRIPT)(
    window,
    { documentElement: root },
    window.localStorage,
    window.matchMedia,
  );
  return root;
}

test('el script previo a la hidratación resuelve igual que resolveTheme', () => {
  for (const stored of [null, 'light', 'dark', 'sepia']) {
    for (const system of [true, false]) {
      const root = runInitScript(stored, system);
      const expected = resolveTheme(stored, system);
      assert.equal(root.dataset.theme, expected, `stored=${stored} system=${system}`);
      assert.equal(root.style.colorScheme, expected);
    }
  }
});

test('si el almacenamiento está bloqueado, el script sigue al sistema', () => {
  assert.equal(runInitScript(null, true, true).dataset.theme, 'light');
  assert.equal(runInitScript(null, false, true).dataset.theme, 'dark');
});

// ───────────── contraste de las paletas reales (app/globals.css) ─────────────

type Rgb = [number, number, number];

function palettes(): Record<'dark' | 'light', Record<string, Rgb>> {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  const block = (selector: RegExp) => {
    const body = css.match(selector)?.[1];
    assert.ok(body, `no se encontró el bloque ${selector}`);
    return Object.fromEntries(
      [...body.matchAll(/--c-([\w-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)].map((m) => [m[1], [+m[2], +m[3], +m[4]] as Rgb]),
    );
  };
  return {
    dark: block(/:root\s*\{([^}]*)\}/),
    light: block(/:root\[data-theme=["']light["']\]\s*\{([^}]*)\}/),
  };
}

const luminance = ([r, g, b]: Rgb) => {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** Color de fondo de una insignia: el color de estado al 15 % sobre la tarjeta. */
const tint = (color: Rgb, over: Rgb, alpha = 0.15): Rgb =>
  color.map((c, i) => Math.round(c * alpha + over[i] * (1 - alpha))) as Rgb;
const BLACK: Rgb = [0, 0, 0];

for (const theme of ['dark', 'light'] as const) {
  test(`contraste del tema ${theme === 'dark' ? 'oscuro' : 'claro'}`, () => {
    const p = palettes()[theme];
    for (const token of ['bg', 'bg-card', 'bg-elev', 'line', 'ink', 'ink-dim', 'ink-mute', 'accent', 'ok', 'warn', 'bad']) {
      assert.ok(p[token], `falta --c-${token} en el tema ${theme}`);
    }
    const checks: Array<[string, Rgb, Rgb, number]> = [];
    for (const ground of ['bg', 'bg-card', 'bg-elev']) {
      checks.push([`ink sobre ${ground}`, p.ink, p[ground], 4.5]);
      checks.push([`ink-dim sobre ${ground}`, p['ink-dim'], p[ground], 3]);
      checks.push([`ink-mute sobre ${ground}`, p['ink-mute'], p[ground], 3]);
    }
    for (const ground of ['bg', 'bg-card']) {
      for (const status of ['accent', 'ok', 'warn', 'bad']) checks.push([`${status} sobre ${ground}`, p[status], p[ground], 3]);
    }
    for (const status of ['ok', 'warn', 'bad']) {
      checks.push([`insignia ${status}`, p[status], tint(p[status], p['bg-card']), 3]);
    }
    checks.push(['texto negro sobre el botón principal', BLACK, p.accent, 4.5]);

    const failures = checks
      .map(([name, fg, bg, min]) => ({ name, ratio: contrast(fg, bg), min }))
      .filter((c) => c.ratio < c.min)
      .map((c) => `${c.name}: ${c.ratio.toFixed(2)} < ${c.min}`);
    assert.deepEqual(failures, []);
  });
}
