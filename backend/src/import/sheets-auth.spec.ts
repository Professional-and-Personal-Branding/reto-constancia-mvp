import { createVerify, generateKeyPairSync } from 'crypto';

import { GOOGLE_TOKEN_URL, SHEETS_READONLY_SCOPE, SheetsAuth, normalizePrivateKey } from './sheets-auth';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function decode(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('normalizePrivateKey', () => {
  it('desescapa \\n y quita comillas de una variable de entorno de una línea', () => {
    const oneLine = '"-----BEGIN KEY-----\\nabc\\n-----END KEY-----"';
    expect(normalizePrivateKey(oneLine)).toBe('-----BEGIN KEY-----\nabc\n-----END KEY-----');
  });
});

describe('SheetsAuth', () => {
  const email = 'svc@project.iam.gserviceaccount.com';

  it('firma un JWT RS256 con los claims del flujo de cuenta de servicio', () => {
    const auth = new SheetsAuth({ email, privateKey });
    const jwt = auth.buildAssertion(1_700_000_000);
    const [h, c, s] = jwt.split('.');
    expect(decode(h)).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(decode(c)).toEqual({
      iss: email,
      scope: SHEETS_READONLY_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    });
    const ok = createVerify('RSA-SHA256')
      .update(`${h}.${c}`)
      .verify(publicKey, Buffer.from(s, 'base64url'));
    expect(ok).toBe(true);
  });

  it('canjea el JWT por un access token y lo cachea', async () => {
    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(GOOGLE_TOKEN_URL);
      const body = new URLSearchParams(String(init?.body));
      expect(body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
      expect(body.get('assertion')?.split('.')).toHaveLength(3);
      return jsonResponse(200, { access_token: 'tok-1', expires_in: 3600 });
    });
    let now = 1_000_000;
    const auth = new SheetsAuth({ email, privateKey }, fetchMock, () => now);
    expect(await auth.getAccessToken()).toBe('tok-1');
    expect(await auth.getAccessToken()).toBe('tok-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A 5 minutos de expirar se renueva
    now += 3600 * 1000 - 4 * 60 * 1000;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { access_token: 'tok-2', expires_in: 3600 }));
    expect(await auth.getAccessToken()).toBe('tok-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('propaga un error claro si Google no emite el token', async () => {
    const fetchMock = jest.fn(async () => new Response('invalid_grant', { status: 400 }));
    const auth = new SheetsAuth({ email, privateKey }, fetchMock);
    await expect(auth.getAccessToken()).rejects.toThrow(/400/);
  });
});
