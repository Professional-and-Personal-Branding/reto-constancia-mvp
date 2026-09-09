import { corsWarning, resolveCorsOrigin } from './cors';

describe('resolveCorsOrigin', () => {
  it('usa la lista configurada y normaliza espacios y slash final', () => {
    expect(
      resolveCorsOrigin({ CORS_ORIGIN: 'https://app.com/, http://localhost:3005' }),
    ).toEqual(['https://app.com', 'http://localhost:3005']);
  });

  it('en desarrollo sin configuración refleja el origen del navegador', () => {
    expect(resolveCorsOrigin({})).toBe(true);
    expect(resolveCorsOrigin({ NODE_ENV: 'development' })).toBe(true);
  });

  it('en producción sin configuración NO abre la API a cualquier origen', () => {
    expect(resolveCorsOrigin({ NODE_ENV: 'production' })).toBe(false);
    expect(resolveCorsOrigin({ NODE_ENV: 'production', CORS_ORIGIN: '  ' })).toBe(false);
  });

  it('avisa cuando falta configuración y calla cuando está bien', () => {
    expect(corsWarning(resolveCorsOrigin({ NODE_ENV: 'production' }), { NODE_ENV: 'production' })).toMatch(
      /CORS_ORIGIN/,
    );
    expect(corsWarning(resolveCorsOrigin({}), {})).toMatch(/desarrollo/);
    expect(
      corsWarning(resolveCorsOrigin({ CORS_ORIGIN: 'https://app.com' }), {
        CORS_ORIGIN: 'https://app.com',
      }),
    ).toBeNull();
  });
});
