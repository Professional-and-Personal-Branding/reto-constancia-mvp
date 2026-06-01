'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (e) {
      const apiErr = e as ApiError;
      setErr(
        apiErr.status === 401
          ? 'Email o contraseña incorrectos'
          : 'No se pudo conectar al servidor',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-accent text-xs uppercase tracking-[0.2em] font-semibold mb-2">
          Modo disciplina
        </p>
        <h2 className="display text-5xl leading-none">Entra al reto</h2>
        <p className="text-ink-dim mt-3">
          Sin pulso registrado no hay acto heroico reconocido.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
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
          <label className="label" htmlFor="password">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        {err && (
          <div className="text-bad text-sm bg-bad/10 border border-bad/30 rounded-md px-4 py-2.5">
            {err}
          </div>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <p className="text-sm text-ink-dim text-center">
        ¿Aún no tienes cuenta?{' '}
        <Link href="/register" className="text-accent hover:underline">
          Regístrate
        </Link>
      </p>
    </div>
  );
}
