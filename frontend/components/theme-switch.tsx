'use client';

import { cn } from '@/lib/cn';
import { useTheme } from '@/lib/use-theme';

/** Interruptor de modo claro/oscuro del encabezado. Encendido = modo claro. */
export function ThemeSwitch({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const light = theme === 'light';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={light}
      aria-label="Modo claro"
      title={light ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
      onClick={toggle}
      // Hasta montar no se conoce el tema: se reserva el espacio sin mostrar un estado falso
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-line bg-bg-elev transition',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        theme === null && 'invisible',
        className,
      )}
    >
      <span aria-hidden className="absolute left-1.5 text-[11px] leading-none text-ink-mute">☾</span>
      <span aria-hidden className="absolute right-1.5 text-[11px] leading-none text-ink-mute">☀</span>
      <span
        aria-hidden
        className={cn(
          'relative z-10 h-5 w-5 rounded-full bg-accent shadow transition-transform',
          light ? 'translate-x-6' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
