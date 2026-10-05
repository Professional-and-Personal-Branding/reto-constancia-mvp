import { Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { NextFunction, Response } from 'express';

import { ContextRequest, requestContextMiddleware } from './request-context';

function fakeRes(writableFinished: boolean, statusCode = 200) {
  const res = new EventEmitter() as EventEmitter & {
    statusCode: number;
    writableFinished: boolean;
    headers: Record<string, string>;
    setHeader: (k: string, v: string) => void;
  };
  res.statusCode = statusCode;
  res.writableFinished = writableFinished;
  res.headers = {};
  res.setHeader = (k, v) => {
    res.headers[k] = v;
  };
  return res;
}

function run(headers: Record<string, string>, res: ReturnType<typeof fakeRes>) {
  const req = { method: 'GET', originalUrl: '/api/x', headers } as unknown as ContextRequest;
  const next = jest.fn() as NextFunction;
  requestContextMiddleware(req, res as unknown as Response, next);
  return { req, next };
}

describe('requestContextMiddleware', () => {
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('fija el identificador en la petición y en la cabecera, y sigue', () => {
    const res = fakeRes(true);
    const { req, next } = run({ 'x-request-id': 'abc-123' }, res);
    expect(req.requestId).toBe('abc-123');
    expect(res.headers['X-Request-Id']).toBe('abc-123');
    expect(next).toHaveBeenCalled();
  });

  it('una respuesta terminada deja exactamente una línea', () => {
    const res = fakeRes(true, 201);
    run({}, res);
    res.emit('close');
    res.emit('close');
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({ status: 201, route: '/api/x' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('una respuesta abortada deja una sola línea con 499', () => {
    const res = fakeRes(false);
    run({}, res);
    res.emit('close');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({ status: 499, aborted: true });
    expect(log).not.toHaveBeenCalled();
  });
});
