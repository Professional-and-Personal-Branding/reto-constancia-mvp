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
  /** 'blob' devuelve el archivo tal cual (descargas); por defecto se lee JSON */
  as?: 'json' | 'blob';
}

let refreshPromise: Promise<AuthTokens> | null = null;

/** El servidor rechazó el refresh token: la sesión ya no sirve. */
const isSessionRejected = (status: number) => status === 400 || status === 401 || status === 403;

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
      // Solo un refresh token rechazado invalida la sesión; un 429 o un 5xx son transitorios
      if (isSessionRejected(res.status)) setTokens(null);
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
  const { body, auth = true, as = 'json', headers, ...rest } = opts;
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
    let fresh: AuthTokens;
    try {
      fresh = await refreshTokens();
    } catch (e) {
      // Un corte de red, una navegación o un 429/5xx al renovar no cierran la sesión: el error
      // se propaga y los tokens se conservan para el próximo intento.
      if (!(e instanceof ApiError) || !isSessionRejected(e.status)) throw e;
      setTokens(null);
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      throw new ApiError(401, null, 'Sesión expirada');
    }
    // El reintento queda fuera del try: si falla (p. ej. abortado al cambiar de página) es un
    // error de esa petición, no de la sesión.
    res = await doFetch(fresh.accessToken);
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new ApiError(res.status, errBody);
  }

  if (res.status === 204) return undefined as T;
  if (as === 'blob') return (await res.blob()) as T;
  return (await res.json()) as T;
}
