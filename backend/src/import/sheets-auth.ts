import { createSign } from 'crypto';

/**
 * Autenticación de cuenta de servicio de Google sin dependencias (spec google-sheets-import,
 * design.md decisión 1): JWT RS256 firmado con `crypto` y canjeado por un access token.
 *
 * Alternativas documentadas en design.md: `google-auth-library` (reemplaza esta clase por
 * `new JWT({ email, key, scopes })`), `googleapis`, OAuth de usuario.
 */
export interface SheetsAuthConfig {
  email: string;
  privateKey: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const SHEETS_READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

const TOKEN_TTL_SECONDS = 3600;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** Las variables de entorno de una sola línea traen `\n` escapados y a veces comillas. */
export function normalizePrivateKey(raw: string): string {
  return raw.trim().replace(/^"|"$/g, '').replace(/\\n/g, '\n');
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

export class SheetsAuth {
  private cached?: { token: string; expiresAt: number };

  constructor(
    private readonly config: SheetsAuthConfig,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** JWT firmado (RS256) con los claims que exige el flujo de cuenta de servicio. */
  buildAssertion(issuedAtSeconds = Math.floor(this.now() / 1000)): string {
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(
      JSON.stringify({
        iss: this.config.email,
        scope: SHEETS_READONLY_SCOPE,
        aud: GOOGLE_TOKEN_URL,
        iat: issuedAtSeconds,
        exp: issuedAtSeconds + TOKEN_TTL_SECONDS,
      }),
    );
    const signingInput = `${header}.${claims}`;
    const signature = createSign('RSA-SHA256')
      .update(signingInput)
      .sign(normalizePrivateKey(this.config.privateKey));
    return `${signingInput}.${base64url(signature)}`;
  }

  async getAccessToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt - this.now() > REFRESH_MARGIN_MS) {
      return this.cached.token;
    }
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: this.buildAssertion(),
    });
    const res = await this.fetchImpl(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Google no emitió el token (${res.status}): ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { access_token: string; expires_in?: number };
    const ttl = (json.expires_in ?? TOKEN_TTL_SECONDS) * 1000;
    this.cached = { token: json.access_token, expiresAt: this.now() + ttl };
    return json.access_token;
  }
}
