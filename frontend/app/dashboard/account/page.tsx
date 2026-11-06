'use client';

import { useState } from 'react';
import { api, ApiError, setTokens } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { accountErrorMessage, MISMATCH_MESSAGE, passwordsMatch } from '@/lib/account';
import type { AuthTokens, SafeUser } from '@/lib/types';

export default function AccountPage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="display text-4xl">Mi cuenta</h1>
        <p className="text-ink-dim mt-2">Tus datos, tu nombre y tu contraseña.</p>
      </div>

      <section aria-labelledby="account-data" className="card p-5 space-y-3">
        <h2 id="account-data" className="text-lg font-semibold">
          Tus datos
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-ink-dim">Email</dt>
          <dd data-testid="account-email" className="break-all">
            {user.email}
          </dd>
          <dt className="text-ink-dim">Rol</dt>
          <dd>{user.role === 'ADMIN' ? 'Administrador' : 'Participante'}</dd>
        </dl>
      </section>

      <NameForm user={user} />
      <PasswordForm />
    </div>
  );
}

function Feedback({ error, ok }: { error: string | null; ok: string | null }) {
  if (error) {
    return (
      <div role="alert" className="text-bad text-sm bg-bad/10 border border-bad/30 rounded-md px-4 py-2.5">
        {error}
      </div>
    );
  }
  if (ok) {
    return (
      <p role="status" className="text-sm text-ok">
        {ok}
      </p>
    );
  }
  return null;
}

function NameForm({ user }: { user: SafeUser }) {
  const { updateUser } = useAuth();
  const [name, setName] = useState(user.name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    setPending(true);
    try {
      const updated = await api<SafeUser>('/users/me', { method: 'PATCH', body: { name } });
      updateUser({ ...user, ...updated });
      setName(updated.name);
      setOk('Nombre actualizado.');
    } catch (err) {
      const apiErr = err as ApiError;
      setError(accountErrorMessage(apiErr.status ?? 0, apiErr.body));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} aria-labelledby="account-name" className="card p-5 space-y-4">
      <h2 id="account-name" className="text-lg font-semibold">
        Nombre
      </h2>
      <div>
        <label className="label" htmlFor="account-name-input">
          Nombre
        </label>
        <input
          id="account-name-input"
          type="text"
          required
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
      </div>
      <Feedback error={error} ok={ok} />
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? 'Guardando…' : 'Guardar nombre'}
      </button>
    </form>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    if (!passwordsMatch(next, confirmation)) {
      setError(MISMATCH_MESSAGE);
      return;
    }
    setPending(true);
    try {
      const tokens = await api<AuthTokens>('/users/me/password', {
        method: 'PATCH',
        body: { currentPassword: current, newPassword: next },
      });
      setTokens(tokens);
      setCurrent('');
      setNext('');
      setConfirmation('');
      setOk('Contraseña actualizada. Se cerraron las sesiones abiertas en otros dispositivos.');
    } catch (err) {
      const apiErr = err as ApiError;
      setError(accountErrorMessage(apiErr.status ?? 0, apiErr.body));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} aria-labelledby="account-password" className="card p-5 space-y-4">
      <h2 id="account-password" className="text-lg font-semibold">
        Contraseña
      </h2>
      <div>
        <label className="label" htmlFor="account-current">
          Contraseña actual
        </label>
        <input
          id="account-current"
          type="password"
          required
          className="input"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
        />
      </div>
      <div>
        <label className="label" htmlFor="account-new">
          Nueva contraseña
        </label>
        <input
          id="account-new"
          type="password"
          required
          className="input"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          aria-describedby="account-new-hint"
        />
        <p id="account-new-hint" className="text-xs text-ink-mute mt-1">
          Mínimo 8 caracteres, con al menos una letra y un número.
        </p>
      </div>
      <div>
        <label className="label" htmlFor="account-confirm">
          Repite la nueva contraseña
        </label>
        <input
          id="account-confirm"
          type="password"
          required
          className="input"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      <Feedback error={error} ok={ok} />
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? 'Cambiando…' : 'Cambiar contraseña'}
      </button>
    </form>
  );
}
