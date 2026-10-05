import {
  accessLogLevel,
  buildRequestLogEntry,
  resolveRequestId,
  resolveRoute,
} from './request-log';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('resolveRequestId', () => {
  it('reutiliza un identificador válido', () => {
    expect(resolveRequestId('abc-123')).toBe('abc-123');
    expect(resolveRequestId('A.b_c-9')).toBe('A.b_c-9');
  });

  it('genera un UUID v4 si falta o no es válido', () => {
    for (const bad of [undefined, '', 'a'.repeat(65), 'a b', 'x\ny', ['abc'], 42]) {
      expect(resolveRequestId(bad)).toMatch(UUID_V4);
    }
  });
});

describe('resolveRoute', () => {
  it('usa la plantilla de la ruta si hubo handler', () => {
    expect(resolveRoute({ routeTemplate: '/api/challenges/:id', originalUrl: '/api/challenges/abc?x=1' })).toBe(
      '/api/challenges/:id',
    );
  });

  it('sin handler usa el path sin query', () => {
    expect(resolveRoute({ originalUrl: '/api/no-existe?token=secreto' })).toBe('/api/no-existe');
  });
});

describe('accessLogLevel', () => {
  it('log por debajo de 400 y para 401 y 404; warn para el resto', () => {
    expect(accessLogLevel(200)).toBe('log');
    expect(accessLogLevel(304)).toBe('log');
    expect(accessLogLevel(401)).toBe('log');
    expect(accessLogLevel(404)).toBe('log');
    expect(accessLogLevel(400)).toBe('warn');
    expect(accessLogLevel(403)).toBe('warn');
    expect(accessLogLevel(429)).toBe('warn');
    expect(accessLogLevel(499)).toBe('warn');
    expect(accessLogLevel(500)).toBe('warn');
    expect(accessLogLevel(503)).toBe('warn');
  });
});

describe('buildRequestLogEntry', () => {
  it('arma la línea con lista blanca: nunca cuerpo, query ni cabeceras', () => {
    const req = {
      method: 'POST',
      originalUrl: '/api/x?token=secreto',
      requestId: 'r-1',
      body: { password: 'Secret123', refreshToken: 'rt' },
      headers: { authorization: 'Bearer jwt.x.y' },
      query: { token: 'secreto' },
    };
    const line = JSON.stringify(buildRequestLogEntry(req, 400, 12.4));
    for (const secret of ['Secret123', 'rt"', 'Bearer', 'jwt.x.y', 'secreto', 'password', 'refreshToken']) {
      expect(line).not.toContain(secret);
    }
    expect(JSON.parse(line)).toEqual({
      requestId: 'r-1',
      method: 'POST',
      route: '/api/x',
      status: 400,
      ms: 12,
      userId: null,
    });
  });

  it('incluye el usuario del JWT', () => {
    const entry = buildRequestLogEntry({ method: 'GET', originalUrl: '/api/y', requestId: 'r', user: { sub: 'u1' } }, 200, 3);
    expect(entry.userId).toBe('u1');
  });

  it('una petición abortada queda con 499 y aborted', () => {
    const entry = buildRequestLogEntry({ method: 'GET', originalUrl: '/api/y', requestId: 'r' }, 200, 50, true);
    expect(entry).toMatchObject({ status: 499, aborted: true });
  });
});
