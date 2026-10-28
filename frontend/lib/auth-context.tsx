'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';

import { api, ApiError, getTokens, setTokens } from './api';
import { afterRefreshRejected } from './account';
import type { AuthResponse, SafeUser } from './types';

interface AuthState {
  user: SafeUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  /** Actualiza el usuario en memoria (p. ej. tras cambiar el nombre) sin recargar la página. */
  updateUser: (user: SafeUser) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refresh = useCallback(async () => {
    const tokens = getTokens();
    if (!tokens) {
      setUser(null);
      setLoading(false);
      return;
    }
    // Solo un 401 (sesión inválida tras intentar renovarla) cierra la sesión. Un 429, un 5xx o
    // un corte de red son transitorios: se reintenta con espera creciente y se conservan los
    // tokens, para no echar al usuario por un pico de tráfico.
    const delays = [500, 1500, 3000];
    let rotated = false;
    for (let attempt = 0; ; attempt++) {
      const used = getTokens()?.refreshToken ?? '';
      try {
        const me = await api<SafeUser>('/auth/me');
        setUser(me);
        break;
      } catch (e) {
        const status = e instanceof ApiError ? e.status : 0;
        // Tokens reemplazados mientras tanto (otra pestaña cambió la contraseña): se reintenta
        // una vez con ellos en vez de borrarlos.
        if (status === 401 && !rotated && afterRefreshRejected(getTokens(), used) === 'retry') {
          rotated = true;
          attempt--;
          continue;
        }
        if (status === 401 || attempt >= delays.length) {
          setUser(null);
          if (status === 401) setTokens(null);
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api<AuthResponse>('/auth/login', {
        method: 'POST',
        body: { email, password },
        auth: false,
      });
      setTokens(res.tokens);
      setUser(res.user);
      router.push('/dashboard');
    },
    [router],
  );

  const register = useCallback(
    async (email: string, name: string, password: string) => {
      const res = await api<AuthResponse>('/auth/register', {
        method: 'POST',
        body: { email, name, password },
        auth: false,
      });
      setTokens(res.tokens);
      setUser(res.user);
      router.push('/dashboard');
    },
    [router],
  );

  const updateUser = useCallback((next: SafeUser) => setUser(next), []);

  const logout = useCallback(() => {
    setTokens(null);
    setUser(null);
    router.push('/login');
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
