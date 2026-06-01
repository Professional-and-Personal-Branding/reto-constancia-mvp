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

import { api, getTokens, setTokens } from './api';
import type { AuthResponse, SafeUser } from './types';

interface AuthState {
  user: SafeUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
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
    try {
      const me = await api<SafeUser>('/auth/me');
      setUser(me);
    } catch {
      setUser(null);
      setTokens(null);
    } finally {
      setLoading(false);
    }
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

  const logout = useCallback(() => {
    setTokens(null);
    setUser(null);
    router.push('/login');
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
