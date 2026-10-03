import { jwtExpiresIn } from './jwt-expiry';

describe('jwtExpiresIn', () => {
  it('usa el valor por defecto si la variable no está definida', () => {
    expect(jwtExpiresIn(undefined, '15m', 'JWT_ACCESS_EXPIRES_IN')).toBe('15m');
    expect(jwtExpiresIn('', '7d', 'JWT_REFRESH_EXPIRES_IN')).toBe('7d');
  });

  it('acepta duraciones con unidad y segundos como número', () => {
    expect(jwtExpiresIn('30m', '15m', 'X')).toBe('30m');
    expect(jwtExpiresIn('12h', '15m', 'X')).toBe('12h');
    expect(jwtExpiresIn('2 days', '15m', 'X')).toBe('2 days');
    expect(jwtExpiresIn('900', '15m', 'X')).toBe(900);
  });

  it('rechaza un valor mal escrito nombrando la variable', () => {
    expect(() => jwtExpiresIn('quince minutos', '15m', 'JWT_ACCESS_EXPIRES_IN')).toThrow(/JWT_ACCESS_EXPIRES_IN/);
    expect(() => jwtExpiresIn('15 lunas', '15m', 'JWT_ACCESS_EXPIRES_IN')).toThrow(/duración válida/);
  });
});
