import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { FetchLike, SheetsAuth } from './sheets-auth';

/**
 * Cliente mínimo de Google Sheets (solo lectura) sobre la API REST v4.
 * Frontera inyectable: los tests lo reemplazan por un fake (ver import-sheet.e2e-spec.ts).
 */
export type SheetsReadReason = 'not_shared' | 'not_found' | 'invalid_range' | 'api_error';

export class SheetsReadError extends Error {
  constructor(
    public readonly reason: SheetsReadReason,
    message: string,
  ) {
    super(message);
    this.name = 'SheetsReadError';
  }
}

export interface SpreadsheetInfo {
  title: string;
  sheets: string[];
}

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

@Injectable()
export class SheetsClient {
  private auth?: SheetsAuth;
  private fetchImpl: FetchLike = (input, init) => fetch(input, init);

  constructor(private readonly config: ConfigService) {}

  /** Para tests: reemplaza el transporte HTTP. */
  useFetch(fetchImpl: FetchLike): void {
    this.fetchImpl = fetchImpl;
    this.auth = undefined;
  }

  isConfigured(): boolean {
    return !!this.config.get<string>('GOOGLE_SERVICE_ACCOUNT_EMAIL') && !!this.config.get<string>('GOOGLE_PRIVATE_KEY');
  }

  /** Rango por defecto (env GOOGLE_SHEETS_DEFAULT_RANGE) o undefined para usar la primera hoja. */
  defaultRange(): string | undefined {
    return this.config.get<string>('GOOGLE_SHEETS_DEFAULT_RANGE') || undefined;
  }

  async getSpreadsheet(spreadsheetId: string): Promise<SpreadsheetInfo> {
    const url = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties.title`;
    const json = (await this.request(url)) as {
      properties?: { title?: string };
      sheets?: { properties?: { title?: string } }[];
    };
    return {
      title: json.properties?.title ?? '',
      sheets: (json.sheets ?? []).map((s) => s.properties?.title ?? '').filter(Boolean),
    };
  }

  async getValues(spreadsheetId: string, range: string): Promise<string[][]> {
    const url = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`;
    const json = (await this.request(url)) as { values?: unknown[][] };
    return (json.values ?? []).map((row) => row.map((cell) => (cell === null || cell === undefined ? '' : String(cell))));
  }

  private getAuth(): SheetsAuth {
    if (!this.auth) {
      this.auth = new SheetsAuth(
        {
          email: this.config.get<string>('GOOGLE_SERVICE_ACCOUNT_EMAIL') ?? '',
          privateKey: this.config.get<string>('GOOGLE_PRIVATE_KEY') ?? '',
        },
        this.fetchImpl,
      );
    }
    return this.auth;
  }

  private async request(url: string): Promise<unknown> {
    let token: string;
    try {
      token = await this.getAuth().getAccessToken();
    } catch (e) {
      throw new SheetsReadError('api_error', e instanceof Error ? e.message : 'Error de autenticación con Google');
    }
    const res = await this.fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) return res.json();
    const text = await res.text().catch(() => '');
    switch (res.status) {
      case 403:
        throw new SheetsReadError(
          'not_shared',
          'Sin acceso a la hoja: compártela (lector) con el email de la cuenta de servicio',
        );
      case 404:
        throw new SheetsReadError('not_found', 'La hoja no existe o el spreadsheetId es incorrecto');
      case 400:
        throw new SheetsReadError('invalid_range', `Rango u hoja inválidos: ${text.slice(0, 160)}`);
      default:
        throw new SheetsReadError('api_error', `Google Sheets respondió ${res.status}: ${text.slice(0, 160)}`);
    }
  }
}
