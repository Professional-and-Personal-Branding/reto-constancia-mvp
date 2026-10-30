'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { UserConfirmDialog, TemporaryPasswordDialog } from '@/components/user-dialogs';
import { accountErrorMessage } from '@/lib/account';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { SafeUser } from '@/lib/types';
import {
  deactivateConfirmation,
  filterUsers,
  resetConfirmation,
  roleConfirmation,
  roleLabel,
  rowActions,
  sortUsers,
  statusLabel,
} from '@/lib/users';

type Pending = { kind: 'deactivate' | 'role' | 'reset'; user: SafeUser } | null;

interface TemporaryResult {
  userId: string;
  name: string;
  active: boolean;
  temporaryPassword: string;
}

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const isAdmin = me?.role === 'ADMIN';
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<Pending>(null);
  const [result, setResult] = useState<TemporaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: users, isLoading } = useQuery<SafeUser[]>({
    queryKey: ['users'],
    queryFn: () => api<SafeUser[]>('/users'),
    enabled: isAdmin,
  });

  const patchMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { active?: boolean; role?: SafeUser['role'] } }) =>
      api<SafeUser>(`/users/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => setError(accountErrorMessage((err as ApiError).status ?? 0, (err as ApiError).body)),
    onSettled: () => setPending(null),
  });

  const resetMut = useMutation({
    mutationFn: (target: SafeUser) =>
      api<{ temporaryPassword: string }>(`/users/${target.id}/reset-password`, { method: 'POST' }).then((r) => ({
        userId: target.id,
        name: target.name,
        active: target.active,
        temporaryPassword: r.temporaryPassword,
      })),
    onSuccess: (r) => {
      setError(null);
      setResult(r);
    },
    onError: (err) => setError(accountErrorMessage((err as ApiError).status ?? 0, (err as ApiError).body)),
    onSettled: () => setPending(null),
  });

  if (me && !isAdmin) {
    return <div className="card p-8 text-center text-ink-dim">Sección solo para administradores.</div>;
  }

  const rows = sortUsers(filterUsers(users ?? [], search));
  const busy = patchMut.isPending || resetMut.isPending;

  function confirm() {
    if (!pending) return;
    const { kind, user } = pending;
    setError(null);
    if (kind === 'deactivate') patchMut.mutate({ id: user.id, body: { active: false } });
    else if (kind === 'role')
      patchMut.mutate({ id: user.id, body: { role: user.role === 'ADMIN' ? 'PARTICIPANT' : 'ADMIN' } });
    else resetMut.mutate(user);
  }

  function dialogCopy(p: NonNullable<Pending>) {
    if (p.kind === 'deactivate')
      return { title: 'Desactivar usuario', message: deactivateConfirmation(p.user.name), label: 'Desactivar' };
    if (p.kind === 'role')
      return {
        title: p.user.role === 'ADMIN' ? 'Quitar admin' : 'Hacer admin',
        message: roleConfirmation(p.user),
        label: 'Confirmar',
      };
    return { title: 'Reiniciar contraseña', message: resetConfirmation(p.user.name), label: 'Reiniciar' };
  }

  const copy = pending ? dialogCopy(pending) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="display text-4xl">Usuarios</h1>
        <p className="text-ink-dim mt-2">
          Busca cuentas, actívalas o desactívalas, cambia su rol o reinicia su contraseña.
        </p>
      </div>

      <div className="max-w-md">
        <label className="label" htmlFor="users-search">
          Buscar por nombre o correo
        </label>
        <input
          id="users-search"
          type="search"
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && (
        <div role="alert" className="text-bad text-sm bg-bad/10 border border-bad/30 rounded-md px-4 py-2.5">
          {error}
        </div>
      )}

      {isLoading ? (
        <p className="text-ink-dim">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="card p-6 text-ink-dim text-center">No hay usuarios que coincidan.</p>
      ) : (
        <ul className="space-y-3" aria-label="Usuarios">
          {rows.map((u) => {
            const actions = rowActions(u, me?.id);
            return (
              <li
                key={u.id}
                data-testid="user-row"
                data-email={u.email}
                className="card p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium break-words">{u.name}</p>
                  <p className="text-sm text-ink-dim break-all">{u.email}</p>
                  <p className="text-xs text-ink-mute mt-1">
                    <span data-testid="user-role">{roleLabel(u)}</span> ·{' '}
                    <span data-testid="user-status">{statusLabel(u)}</span>
                  </p>
                </div>
                {actions.isSelf ? (
                  <div className="text-sm flex flex-wrap items-center gap-3">
                    <span className="badge">Tú</span>
                    <Link href="/dashboard/account" className="text-accent underline">
                      Cambiar mi contraseña
                    </Link>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-ghost text-sm py-1.5 px-3"
                      disabled={busy}
                      onClick={() => {
                        if (actions.activeNeedsConfirm) setPending({ kind: 'deactivate', user: u });
                        else patchMut.mutate({ id: u.id, body: { active: true } });
                      }}
                    >
                      {actions.toggleActiveLabel}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost text-sm py-1.5 px-3"
                      disabled={busy}
                      onClick={() => setPending({ kind: 'role', user: u })}
                    >
                      {actions.toggleRoleLabel}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost text-sm py-1.5 px-3"
                      disabled={busy}
                      onClick={() => setPending({ kind: 'reset', user: u })}
                    >
                      {actions.resetLabel}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {pending && copy && (
        <UserConfirmDialog
          title={copy.title}
          message={copy.message}
          confirmLabel={copy.label}
          isPending={busy}
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        />
      )}
      {result && (
        <TemporaryPasswordDialog
          name={result.name}
          active={result.active}
          temporaryPassword={result.temporaryPassword}
          onClose={() => setResult(null)}
        />
      )}
    </div>
  );
}
