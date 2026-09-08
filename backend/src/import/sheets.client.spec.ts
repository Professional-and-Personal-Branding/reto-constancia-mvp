import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync } from 'crypto';

import { SheetsClient, SheetsReadError } from './sheets.client';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function config(env: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => env[key] } as unknown as ConfigService;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const configured = {
  GOOGLE_SERVICE_ACCOUNT_EMAIL: 'svc@p.iam.gserviceaccount.com',
  GOOGLE_PRIVATE_KEY: privateKey,
};

describe('SheetsClient', () => {
  it('isConfigured es false sin las variables', () => {
    expect(new SheetsClient(config({})).isConfigured()).toBe(false);
    expect(new SheetsClient(config({ GOOGLE_SERVICE_ACCOUNT_EMAIL: 'x' })).isConfigured()).toBe(false);
    expect(new SheetsClient(config(configured)).isConfigured()).toBe(true);
  });

  function clientWith(responses: Array<(url: string) => Response>) {
    const client = new SheetsClient(config(configured));
    const calls: string[] = [];
    let i = 0;
    client.useFetch(async (url: string) => {
      calls.push(url);
      if (url.startsWith('https://oauth2.googleapis.com/token')) {
        return json(200, { access_token: 'tok', expires_in: 3600 });
      }
      const handler = responses[i++] ?? responses[responses.length - 1];
      return handler(url);
    });
    return { client, calls };
  }

  it('lee metadatos y valores con las URLs correctas (rango codificado) y el token', async () => {
    const { client, calls } = clientWith([
      () => json(200, { properties: { title: 'Reto' }, sheets: [{ properties: { title: 'mayo' } }, { properties: { title: 'junio' } }] }),
      () => json(200, { values: [['email', 'date'], ['a@x.y', '2026-05-04'], [null, 12]] }),
    ]);
    const info = await client.getSpreadsheet('sheet-1');
    expect(info).toEqual({ title: 'Reto', sheets: ['mayo', 'junio'] });
    const values = await client.getValues('sheet-1', 'junio!A:Z');
    expect(values).toEqual([['email', 'date'], ['a@x.y', '2026-05-04'], ['', '12']]);
    expect(calls[1]).toBe(
      'https://sheets.googleapis.com/v4/spreadsheets/sheet-1?fields=properties.title,sheets.properties.title',
    );
    expect(calls[2]).toBe(
      'https://sheets.googleapis.com/v4/spreadsheets/sheet-1/values/junio!A%3AZ?valueRenderOption=FORMATTED_VALUE',
    );
  });

  it.each([
    [403, 'not_shared'],
    [404, 'not_found'],
    [400, 'invalid_range'],
    [500, 'api_error'],
  ])('mapea HTTP %s a %s', async (status, reason) => {
    const { client } = clientWith([() => new Response('err', { status: status as number })]);
    await expect(client.getValues('s', 'A:Z')).rejects.toMatchObject({ reason });
    await expect(client.getValues('s', 'A:Z')).rejects.toBeInstanceOf(SheetsReadError);
  });
});
