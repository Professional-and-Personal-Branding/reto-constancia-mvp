import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Response } from 'express';

import { REQUEST_ID_HEADER } from './request-context';
import { RequestLike, resolveRequestId, resolveRoute } from './request-log';

interface HttpErrorLike {
  statusCode: number;
  message: string;
}

/** Error de la librería http-errors (body-parser) con un 4xx bien formado, p. ej. el 413. */
export function isClientHttpError(e: unknown): e is HttpErrorLike {
  if (typeof e !== 'object' || e === null) return false;
  const { statusCode, message } = e as { statusCode?: unknown; message?: unknown };
  return (
    Number.isInteger(statusCode) &&
    (statusCode as number) >= 400 &&
    (statusCode as number) < 500 &&
    typeof message === 'string' &&
    message.length > 0
  );
}

export function genericErrorMessage(requestId: string): string {
  return `Ocurrió un error inesperado. Si el problema continúa, comparte este código con el administrador: ${requestId}`;
}

/**
 * Filtro global (spec platform-operations): los 4xx salen como hoy; un error inesperado
 * responde un 500 genérico con el identificador de la petición, sin el mensaje interno, y cada
 * 5xx deja exactamente una línea ERROR. Es el único que registra errores: no se delega en
 * BaseExceptionFilter lo que este registraría de nuevo.
 */
@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const req = host.getArgByIndex<RequestLike & { headers?: Record<string, unknown> }>(0);
    const res = host.getArgByIndex<Response>(1);
    const adapter = this.applicationRef ?? this.httpAdapterHost?.httpAdapter;
    if (!adapter) return super.catch(exception, host);

    // Apps arrancadas sin el middleware de contexto (p. ej. las e2e existentes)
    const requestId = req.requestId ?? resolveRequestId(req.headers?.['x-request-id']);
    req.requestId = requestId;
    if (!adapter.isHeadersSent(res) && typeof res.setHeader === 'function' && !res.getHeader(REQUEST_ID_HEADER)) {
      res.setHeader(REQUEST_ID_HEADER, requestId);
    }
    const route = resolveRoute(req);

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status >= 500) {
        this.logger.error(JSON.stringify({ requestId, route, status, error: exception.name }));
      }
      return super.catch(exception, host);
    }

    if (isClientHttpError(exception)) {
      const { statusCode, message } = exception;
      if (adapter.isHeadersSent(res)) adapter.end(res);
      else adapter.reply(res, { statusCode, message }, statusCode);
      return;
    }

    const error = exception instanceof Error ? exception : undefined;
    this.logger.error(
      JSON.stringify({ requestId, route, status: 500, error: error?.name ?? typeof exception }),
      error?.stack,
    );
    if (adapter.isHeadersSent(res)) {
      adapter.end(res);
      return;
    }
    adapter.reply(res, { statusCode: 500, message: genericErrorMessage(requestId), requestId }, 500);
  }
}
