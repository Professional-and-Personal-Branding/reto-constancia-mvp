import { ConfigService } from '@nestjs/config';

import { folderFor, UploadPurpose } from '../../src/upload/upload-policy';
import { UploadService } from '../../src/upload/upload.service';

/**
 * Evidencia válida para las pruebas (spec upload-guardrails). Las pruebas corren en modo local
 * (ver setup-e2e.ts): la validación es por patrón, así que el archivo no necesita existir.
 */
export const TEST_PUBLIC_URL = 'http://localhost:3000';
export const TEST_BASE_FOLDER = 'reto-constancia';

export interface OwnedAssetInput {
  challengeId: string;
  userId: string;
  purpose?: UploadPurpose;
  name?: string;
  ext?: string;
}

export function ownedAsset({ challengeId, userId, purpose = 'activity', name = 'foto', ext = 'png' }: OwnedAssetInput) {
  const cloudinaryId = `${folderFor(TEST_BASE_FOLDER, challengeId, userId, purpose)}/${name}`;
  return { url: `${TEST_PUBLIC_URL}/uploads/${cloudinaryId}.${ext}`, cloudinaryId };
}

/** UploadService en modo local con la misma configuración que las suites e2e. */
export function localUploads(): UploadService {
  const env: Record<string, string> = { PUBLIC_URL: TEST_PUBLIC_URL, CLOUDINARY_FOLDER: TEST_BASE_FOLDER };
  const config = { get: (key: string, fallback?: unknown) => env[key] ?? fallback } as unknown as ConfigService;
  const service = new UploadService(config);
  service.onModuleInit();
  return service;
}
