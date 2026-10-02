/**
 * Tema claro/oscuro de la web.
 *
 * Mientras la persona no elige, se sigue el tema del sistema (prefers-color-scheme); sin
 * preferencia del sistema queda oscuro, como siempre fue la app. La elección del interruptor
 * se guarda por navegador y manda sobre el sistema. Las paletas viven en app/globals.css,
 * seleccionadas por el atributo data-theme de <html>.
 */
export type Theme = 'light' | 'dark';

export const THEME_KEY = 'reto.theme';

const isTheme = (value: unknown): value is Theme => value === 'light' || value === 'dark';

export function resolveTheme(stored: string | null, systemPrefersLight: boolean): Theme {
  if (isTheme(stored)) return stored;
  return systemPrefersLight ? 'light' : 'dark';
}

export function readStoredTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Sin almacenamiento (modo privado estricto): el tema vale solo para esta visita
  }
}

export function systemPrefersLight(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: light)').matches;
}

/** Aplica el tema a <html>: paleta (data-theme) y controles nativos (color-scheme). */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

/**
 * Se ejecuta en <head> antes de pintar, para que ninguna página muestre primero el otro
 * tema. Repite las reglas de resolveTheme (lib/theme.test.ts comprueba que coinciden).
 */
export const THEME_INIT_SCRIPT = `(function () {
  var theme = 'dark';
  try {
    var stored = window.localStorage.getItem('${THEME_KEY}');
    if (stored === 'light' || stored === 'dark') theme = stored;
    else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) theme = 'light';
  } catch (e) {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) theme = 'light';
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();`;
