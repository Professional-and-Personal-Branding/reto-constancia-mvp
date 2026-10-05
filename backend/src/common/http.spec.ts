import { resolveSwaggerEnabled, resolveThrottle, resolveTrustProxy } from './http';

describe('resolveTrustProxy', () => {
  it('en producción sin configurar confía en un proxy delante', () => {
    expect(resolveTrustProxy({ NODE_ENV: 'production' })).toBe(1);
  });

  it('en desarrollo sin configurar no confía en proxies', () => {
    expect(resolveTrustProxy({})).toBe(false);
  });

  it('respeta la configuración explícita', () => {
    expect(resolveTrustProxy({ NODE_ENV: 'production', TRUST_PROXY: 'false' })).toBe(false);
    expect(resolveTrustProxy({ TRUST_PROXY: 'true' })).toBe(true);
    expect(resolveTrustProxy({ TRUST_PROXY: '2' })).toBe(2);
    expect(resolveTrustProxy({ TRUST_PROXY: 'loopback, 10.0.0.0/8' })).toBe('loopback, 10.0.0.0/8');
  });
});

describe('resolveThrottle', () => {
  it('usa 100 peticiones por minuto por defecto', () => {
    expect(resolveThrottle({})).toEqual({ limit: 100, ttl: 60_000 });
  });

  it('admite límites configurados y descarta valores inválidos', () => {
    expect(resolveThrottle({ THROTTLE_LIMIT: '500', THROTTLE_TTL_MS: '30000' })).toEqual({ limit: 500, ttl: 30_000 });
    expect(resolveThrottle({ THROTTLE_LIMIT: 'mucho', THROTTLE_TTL_MS: '-5' })).toEqual({ limit: 100, ttl: 60_000 });
  });
});

describe('resolveSwaggerEnabled', () => {
  it('sin configurar: apagado en producción, encendido en desarrollo y pruebas', () => {
    expect(resolveSwaggerEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(resolveSwaggerEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(resolveSwaggerEnabled({ NODE_ENV: 'test' })).toBe(true);
    expect(resolveSwaggerEnabled({})).toBe(true);
  });

  it('SWAGGER_ENABLED manda en cualquier entorno', () => {
    expect(resolveSwaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' })).toBe(true);
    expect(resolveSwaggerEnabled({ NODE_ENV: 'development', SWAGGER_ENABLED: 'false' })).toBe(false);
    expect(resolveSwaggerEnabled({ NODE_ENV: 'test', SWAGGER_ENABLED: ' TRUE ' })).toBe(true);
  });
});
