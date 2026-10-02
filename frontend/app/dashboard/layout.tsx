'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/cn';
import { ChallengeSelector } from '@/components/challenge-selector';
import { ThemeSwitch } from '@/components/theme-switch';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink-dim">
        Cargando…
      </div>
    );
  }

  const isAdmin = user.role === 'ADMIN';

  const navItems = [
    { href: '/dashboard', label: 'Mi reto' },
    { href: '/dashboard/upload', label: 'Subir actividad' },
    { href: '/dashboard/results', label: 'Ranking' },
    ...(isAdmin
      ? [
          { href: '/dashboard/admin/validations', label: 'Validar', admin: true },
          { href: '/dashboard/admin/participants', label: 'Participantes', admin: true },
          { href: '/dashboard/admin/import', label: 'Importar', admin: true },
          { href: '/dashboard/admin/challenges', label: 'Retos', admin: true },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-line bg-bg sticky top-0 z-10 backdrop-blur">
        {/*
          Marca y controles arriba; las secciones van debajo, a todo el ancho, y se desplazan si no
          caben. En escritorio el participante (tres secciones) las tiene en la misma fila.
        */}
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 sm:gap-x-8">
          <Link href="/dashboard" className="flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 bg-accent rounded-sm flex items-center justify-center text-black font-display text-xl leading-none pt-1">
              R
            </div>
            <span className="display text-xl tracking-wider hidden sm:inline">
              Reto
            </span>
          </Link>
          <nav
            aria-label="Secciones"
            className={cn(
              'order-last w-full flex items-center gap-1 overflow-x-auto',
              !isAdmin && 'lg:order-none lg:w-auto lg:flex-1',
            )}
          >
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'px-3 py-1.5 text-sm rounded-md whitespace-nowrap transition',
                    active
                      ? 'bg-accent/15 text-accent'
                      : 'text-ink-dim hover:text-ink hover:bg-bg-elev',
                    item.admin && 'border border-accent/30',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 sm:flex-none sm:gap-3">
            <ChallengeSelector />
            <ThemeSwitch />
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium leading-tight">{user.name}</p>
              <p className="text-xs text-ink-mute">
                {isAdmin ? 'Administrador' : 'Participante'}
              </p>
            </div>
            <button onClick={logout} className="btn-ghost text-sm py-1.5 px-3">
              Salir
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-screen-xl w-full mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  );
}
