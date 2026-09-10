import { ConfigService } from '@nestjs/config';

import { UploadService } from './upload.service';

function config(env: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string, fallback?: unknown) => env[key] ?? fallback,
  } as unknown as ConfigService;
}

const cloudinaryEnv = {
  CLOUDINARY_CLOUD_NAME: 'demo',
  CLOUDINARY_API_KEY: 'key',
  CLOUDINARY_API_SECRET: 'secret',
};

describe('UploadService: modo local vs Cloudinary', () => {
  it('sin Cloudinary en desarrollo activa el simulador local', () => {
    const svc = new UploadService(config({}));
    svc.onModuleInit();
    expect(svc.isLocalMode).toBe(true);
  });

  it('sin Cloudinary en producción NO activa el simulador local', () => {
    const svc = new UploadService(config({ NODE_ENV: 'production' }));
    svc.onModuleInit();
    // Si se activara, /upload/local quedaría aceptando archivos en producción
    expect(svc.isLocalMode).toBe(false);
  });

  it('con Cloudinary configurado nunca usa el modo local', () => {
    for (const nodeEnv of [undefined, 'production']) {
      const svc = new UploadService(config({ ...cloudinaryEnv, NODE_ENV: nodeEnv }));
      svc.onModuleInit();
      expect(svc.isLocalMode).toBe(false);
    }
  });
});
