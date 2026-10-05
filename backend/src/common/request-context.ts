/*
 * Contexto de petición a nivel Express (spec platform-operations): X-Request-Id y una sola
 * línea de acceso por petición.
 *
 * Se registra justo después de NestFactory.create: Nest monta body-parser recién en init(),
 * así que este middleware corre antes que el parser, que /uploads y que cualquier ruta, y
 * también los 400 de JSON mal formado y los 413 llevan su identificador.
 */
import { INestApplication, Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import {
  accessLogLevel,
  buildRequestLogEntry,
  RequestLike,
  resolveRequestId,
} from './request-log';

export const REQUEST_ID_HEADER = 'X-Request-Id';

export type ContextRequest = Request & RequestLike;

const logger = new Logger('HTTP');

export function requestContextMiddleware(req: ContextRequest, res: Response, next: NextFunction) {
  const requestId = resolveRequestId(req.headers['x-request-id']);
  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  const started = process.hrtime.bigint();

  // `close` se emite una sola vez por respuesta: terminada (writableFinished) o abortada.
  res.once('close', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const aborted = !res.writableFinished;
    const entry = buildRequestLogEntry(req, res.statusCode, ms, aborted);
    logger[accessLogLevel(entry.status)](JSON.stringify(entry));
  });
  next();
}

export function applyRequestContext(app: INestApplication): void {
  app.use(requestContextMiddleware);
}
