/*
 * Funciones puras del registro de peticiones (spec platform-operations).
 * La línea de acceso se arma con una lista blanca: nunca lee el cuerpo, la query ni otras
 * cabeceras, así que contraseñas y tokens no pueden terminar en los logs.
 */
import { randomUUID } from 'node:crypto';

export const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

/** Reutiliza un X-Request-Id válido; si falta o no es válido, genera un UUID v4. */
export function resolveRequestId(header: unknown): string {
  return typeof header === 'string' && REQUEST_ID_PATTERN.test(header) ? header : randomUUID();
}

export interface RequestLike {
  method?: string;
  originalUrl?: string;
  url?: string;
  /** Plantilla de la ruta, guardada por RouteTemplateInterceptor (p. ej. /api/challenges/:id) */
  routeTemplate?: string;
  requestId?: string;
  user?: { sub?: string };
}

/** Plantilla de la ruta si hubo handler; si no (404, errores del parser), el path sin query. */
export function resolveRoute(req: RequestLike): string {
  if (req.routeTemplate) return req.routeTemplate;
  return (req.originalUrl ?? req.url ?? '').split('?')[0];
}

export type AccessLogLevel = 'log' | 'warn';

/** 401 (token vencido) y 404 (bots) van como log para no llenar de ruido los avisos. */
export function accessLogLevel(status: number): AccessLogLevel {
  if (status < 400 || status === 401 || status === 404) return 'log';
  return 'warn';
}

export interface RequestLogEntry {
  requestId: string;
  method: string;
  route: string;
  status: number;
  ms: number;
  userId: string | null;
  aborted?: true;
}

export function buildRequestLogEntry(
  req: RequestLike,
  status: number,
  ms: number,
  aborted = false,
): RequestLogEntry {
  const entry: RequestLogEntry = {
    requestId: req.requestId ?? resolveRequestId(undefined),
    method: req.method ?? 'GET',
    route: resolveRoute(req),
    status: aborted ? 499 : status,
    ms: Math.round(ms),
    userId: req.user?.sub ?? null,
  };
  if (aborted) entry.aborted = true;
  return entry;
}
