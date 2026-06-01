import type { AuthTokens } from './types';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';

const TOKEN_KEY = 'reto.tokens';

export function getTokens(): AuthTokens | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(TOKEN_KEY);
  return raw ? (JSON.parse(raw) as AuthTokens) : null;
}

export function setTokens(tokens: AuthTokens | null): void {
  if (typeof window === 'undefined') return;
  if (tokens) localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, public body: unknown, message?: string) {
    super(message ?? `API error ${status}`);
  }
}

interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  auth?: boolean;
}

let refreshPromise: Promise<AuthTokens> | null = null;

async function refreshTokens(): Promise<AuthTokens> {
  const current = getTokens();
  if (!current) throw new ApiError(401, null, 'Sin refresh token');

  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    });
    if (!res.ok) {
      setTokens(null);
      throw new ApiError(res.status, await res.json().catch(() => null));
    }
    const tokens = (await res.json()) as AuthTokens;
    setTokens(tokens);
    return tokens;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function api<T = unknown>(
  path: string,
  opts: ApiOptions = {},
): Promise<T> {
  const { body, auth = true, headers, ...rest } = opts;
  const tokens = getTokens();

  const buildHeaders = (token?: string): HeadersInit => ({
    'Content-Type': 'application/json',
    ...(headers as Record<string, string>),
    ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
  });

  const doFetch = (token?: string) =>
    fetch(`${API_URL}${path}`, {
      ...rest,
      headers: buildHeaders(token),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res = await doFetch(tokens?.accessToken);

  // Auto-refresh on 401
  if (res.status === 401 && auth && tokens?.refreshToken) {
    try {
      const fresh = await refreshTokens();
      res = await doFetch(fresh.accessToken);
    } catch {
      setTokens(null);
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      throw new ApiError(401, null, 'Sesión expirada');
    }
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new ApiError(res.status, errBody);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
