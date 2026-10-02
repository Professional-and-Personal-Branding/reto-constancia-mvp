'use client';

import { useCallback, useEffect, useState } from 'react';

import { applyTheme, readStoredTheme, resolveTheme, storeTheme, systemPrefersLight, type Theme } from './theme';

/**
 * Tema activo y cómo cambiarlo. El script de <head> ya aplicó el tema antes de pintar;
 * aquí solo se lee, se sigue al sistema mientras no haya elección y se guarda la elección.
 * `theme` es null hasta montar, para no mostrar un estado que el servidor no conoce.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const applied = document.documentElement.dataset.theme;
    setTheme(applied === 'light' || applied === 'dark' ? applied : resolveTheme(readStoredTheme(), systemPrefersLight()));

    const media = window.matchMedia?.('(prefers-color-scheme: light)');
    if (!media) return;
    const follow = () => {
      if (readStoredTheme()) return; // la elección guardada manda sobre el sistema
      const next = resolveTheme(null, media.matches);
      applyTheme(next);
      setTheme(next);
    };
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
  }, []);

  const toggle = useCallback(() => {
    const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    const next: Theme = current === 'light' ? 'dark' : 'light';
    applyTheme(next);
    storeTheme(next);
    setTheme(next);
  }, []);

  return { theme, toggle };
}
