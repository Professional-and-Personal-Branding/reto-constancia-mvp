import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';

import { AllExceptionsFilter, isClientHttpError } from './all-exceptions.filter';

function setup(opts: { requestId?: string; header?: string; headersSent?: boolean } = {}) {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: (k: string, v: string) => {
      headers[k] = v;
    },
    getHeader: (k: string) => headers[k],
  };
  const req: Record<string, unknown> = {
    method: 'GET',
    originalUrl: '/api/x?y=1',
    requestId: opts.requestId,
    headers: opts.header ? { 'x-request-id': opts.header } : {},
  };
  const adapter = {
    reply: jest.fn(),
    end: jest.fn(),
    isHeadersSent: jest.fn(() => !!opts.headersSent),
  };
  const host = { getArgByIndex: (i: number) => (i === 0 ? req : res) } as unknown as ArgumentsHost;
  const filter = new AllExceptionsFilter(adapter as never);
  return { filter, host, adapter, headers, req };
}

describe('AllExceptionsFilter', () => {
  let error: jest.SpyInstance;

  beforeEach(() => {
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('un 409 sale intacto y sin línea ERROR', () => {
    const { filter, host, adapter } = setup({ requestId: 'r' });
    filter.catch(new ConflictException('Ya existe un reto para 1/2094'), host);
    expect(adapter.reply).toHaveBeenCalledWith(
      expect.anything(),
      { statusCode: 409, message: 'Ya existe un reto para 1/2094', error: 'Conflict' },
      409,
    );
    expect(error).not.toHaveBeenCalled();
  });

  it('un 429 del limitador conserva su cuerpo', () => {
    const { filter, host, adapter } = setup({ requestId: 'r' });
    filter.catch(new ThrottlerException(), host);
    expect(adapter.reply).toHaveBeenCalledWith(
      expect.anything(),
      { statusCode: 429, message: 'ThrottlerException: Too Many Requests' },
      429,
    );
    expect(error).not.toHaveBeenCalled();
  });

  it('el JSON mal formado (BadRequestException) responde 400 sin línea ERROR', () => {
    const { filter, host, adapter } = setup({ requestId: 'r' });
    filter.catch(new BadRequestException('Unexpected end of JSON input'), host);
    expect(adapter.reply.mock.calls[0][2]).toBe(400);
    expect(error).not.toHaveBeenCalled();
  });

  it('un 413 de http-errors se responde directo y sin línea ERROR', () => {
    const { filter, host, adapter } = setup({ requestId: 'r' });
    filter.catch({ statusCode: 413, message: 'request entity too large', type: 'entity.too.large' }, host);
    expect(adapter.reply).toHaveBeenCalledWith(
      expect.anything(),
      { statusCode: 413, message: 'request entity too large' },
      413,
    );
    expect(error).not.toHaveBeenCalled();
  });

  it('un 503 deja una sola línea ERROR sin stack y conserva el cuerpo', () => {
    const { filter, host, adapter } = setup({ requestId: 'r-503' });
    const body = { status: 'error', db: 'down', timestamp: 't' };
    filter.catch(new ServiceUnavailableException(body), host);
    expect(adapter.reply).toHaveBeenCalledWith(expect.anything(), body, 503);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]).toHaveLength(1);
    expect(JSON.parse(error.mock.calls[0][0])).toMatchObject({
      requestId: 'r-503',
      route: '/api/x',
      status: 503,
      error: 'ServiceUnavailableException',
    });
  });

  it('un error inesperado responde el 500 genérico sin el mensaje interno y con stack', () => {
    const { filter, host, adapter } = setup({ requestId: 'r-500' });
    filter.catch(new Error('boom interno'), host);
    const [, body, status] = adapter.reply.mock.calls[0];
    expect(status).toBe(500);
    expect(body).toEqual({ statusCode: 500, message: expect.stringContaining('r-500'), requestId: 'r-500' });
    expect(JSON.stringify(body)).not.toContain('boom');
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][1]).toContain('boom interno');
  });

  it.each([
    ['statusCode en texto', { statusCode: '400', message: 'x' }],
    ['mensaje vacío', { statusCode: 400, message: '' }],
    ['http-errors 5xx', { statusCode: 503, message: 'x' }],
    ['un valor que no es objeto', 'cadena'],
  ])('%s va al 500 genérico', (_name, exception) => {
    const { filter, host, adapter } = setup({ requestId: 'r' });
    filter.catch(exception, host);
    expect(adapter.reply.mock.calls[0][2]).toBe(500);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('con las cabeceras ya enviadas termina la respuesta sin escribir', () => {
    const { filter, host, adapter } = setup({ requestId: 'r', headersSent: true });
    filter.catch(new Error('tarde'), host);
    expect(adapter.end).toHaveBeenCalled();
    expect(adapter.reply).not.toHaveBeenCalled();
  });

  it('sin middleware toma el identificador de la cabecera y lo devuelve', () => {
    const { filter, host, adapter, headers } = setup({ header: 'r-1' });
    filter.catch(new Error('x'), host);
    expect(adapter.reply.mock.calls[0][1].requestId).toBe('r-1');
    expect(headers['X-Request-Id']).toBe('r-1');
  });

  it('sin middleware fija la cabecera también en los 4xx', () => {
    const { filter, host, headers } = setup({ header: 'r-2' });
    filter.catch(new ConflictException('x'), host);
    expect(headers['X-Request-Id']).toBe('r-2');
  });
});

describe('isClientHttpError', () => {
  it('solo acepta códigos enteros 4xx con mensaje', () => {
    expect(isClientHttpError({ statusCode: 413, message: 'x' })).toBe(true);
    expect(isClientHttpError({ statusCode: '413', message: 'x' })).toBe(false);
    expect(isClientHttpError({ statusCode: 500, message: 'x' })).toBe(false);
    expect(isClientHttpError({ statusCode: 400, message: '' })).toBe(false);
    expect(isClientHttpError(null)).toBe(false);
  });
});
