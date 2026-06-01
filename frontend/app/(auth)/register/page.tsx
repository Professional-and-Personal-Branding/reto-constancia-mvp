'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';

export default function RegisterPage() {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await register(email, name, password);
    } catch (e) {
      const apiErr = e as ApiError;
      setErr(
        apiErr.status === 409
          ? 'Ese email ya está registrado'
          : 'No se pudo crear la cuenta',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-accent text-xs uppercase tracking-[0.2em] font-semibold mb-2">
          Únete al reto
        </p>
        <h2 className="display text-5xl leading-none">Crea tu cuenta</h2>
        <p className="text-ink-dim mt-3">
          Que mayo no nos agarre de adorno.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <label className="label" htmlFor="name">Nombre</label>
          <input
            id="name"
            required
            minLength={2}
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
        <div>
          <label className="label" htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <p className="text-xs text-ink-mute mt-1.5">Mínimo 8 caracteres.</p>
        </div>

        {err && (
          <div className="text-bad text-sm bg-bad/10 border border-bad/30 rounded-md px-4 py-2.5">
            {err}
          </div>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Creando…' : 'Crear cuenta'}
        </button>
      </form>

      <p className="text-sm text-ink-dim text-center">
        ¿Ya tienes cuenta?{' '}
        <Link href="/login" className="text-accent hover:underline">
          Entra
        </Link>
      </p>
    </div>
  );
}
