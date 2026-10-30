import { matchesFingerprint, passwordFingerprint } from './password-fingerprint';

describe('password-fingerprint (huella de la contraseña)', () => {
  const secret = 'secreto-de-prueba';
  const hash = '$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA';

  it('la huella tiene 22 caracteres base64url y no es ni contiene el hash', () => {
    const pwv = passwordFingerprint(hash, secret);
    expect(pwv).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(pwv).not.toBe(hash);
    expect(hash.includes(pwv)).toBe(false);
  });

  it('la huella cambia cuando cambia el hash y es estable para el mismo hash', () => {
    expect(passwordFingerprint(hash, secret)).toBe(passwordFingerprint(hash, secret));
    expect(passwordFingerprint(`${hash}x`, secret)).not.toBe(passwordFingerprint(hash, secret));
  });

  it('matchesFingerprint acepta la huella propia', () => {
    expect(matchesFingerprint(passwordFingerprint(hash, secret), hash, secret)).toBe(true);
  });

  it('matchesFingerprint rechaza undefined, un número, una cadena más corta y la huella de otro hash', () => {
    expect(matchesFingerprint(undefined, hash, secret)).toBe(false);
    expect(matchesFingerprint(123, hash, secret)).toBe(false);
    expect(matchesFingerprint(passwordFingerprint(hash, secret).slice(0, 10), hash, secret)).toBe(false);
    expect(matchesFingerprint(passwordFingerprint('otro-hash', secret), hash, secret)).toBe(false);
  });
});
