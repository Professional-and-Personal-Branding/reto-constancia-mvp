import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { promises as fs } from 'fs';

import { UploadService } from './upload.service';

function config(env: Record<string, string | undefined>): ConfigService {
  return {
    get: (key: string, fallback?: unknown) => env[key] ?? fallback,
    getOrThrow: (key: string) => {
      if (env[key] === undefined) throw new Error(`falta ${key}`);
      return env[key];
    },
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

describe('UploadService: firma ligada al reto, al usuario y al propósito', () => {
  const CH = '11111111-1111-4111-8111-111111111111';
  const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  it('firma allowed_formats, folder y timestamp, y sube siempre como image', () => {
    const svc = new UploadService(config(cloudinaryEnv));
    svc.onModuleInit();
    const sig = svc.signUpload(CH, ANA, 'activity');
    expect(sig.folder).toBe(`reto-constancia/${CH}/${ANA}/activity`);
    expect(sig.allowedFormats).toBe('heic,jpg,png,webp');
    expect(sig.maxBytes).toBe(10 * 1024 * 1024);
    expect(sig.uploadUrl).toBe('https://api.cloudinary.com/v1_1/demo/image/upload');
    expect(sig.signature).toBe(
      cloudinary.utils.api_sign_request(
        { allowed_formats: sig.allowedFormats, folder: sig.folder, timestamp: sig.timestamp },
        'secret',
      ),
    );
  });

  it('el comprobante acepta PDF y respeta UPLOAD_MAX_BYTES', () => {
    const svc = new UploadService(config({ UPLOAD_MAX_BYTES: '5000' }));
    svc.onModuleInit();
    const sig = svc.signUpload(CH, ANA, 'payment-proof');
    expect(sig).toMatchObject({ local: true, allowedFormats: 'heic,jpg,pdf,png,webp', maxBytes: 5000 });
    expect(sig.folder.endsWith(`/${ANA}/payment-proof`)).toBe(true);
  });

  it('el simulador solo acepta carpetas derivadas del propio usuario', () => {
    const svc = new UploadService(config({}));
    svc.onModuleInit();
    expect(() => svc.parseLocalFolder('reto-constancia/2026-05', ANA)).toThrow('Carpeta de subida no válida');
    expect(() => svc.parseLocalFolder(undefined, ANA)).toThrow(BadRequestException);
    const other = '22222222-2222-4222-8222-222222222222';
    expect(() => svc.parseLocalFolder(`reto-constancia/${CH}/${other}/activity`, ANA)).toThrow(ForbiddenException);
    expect(svc.parseLocalFolder(`reto-constancia/${CH}/${ANA}/activity`, ANA)).toEqual({ challengeId: CH, userId: ANA, purpose: 'activity' });
  });

  describe('saveLocal', () => {
    beforeEach(() => {
      jest.spyOn(fs, 'mkdir').mockResolvedValue(undefined);
      jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
    });
    afterEach(() => jest.restoreAllMocks());
    const file = (originalname: string, mimetype: string) =>
      ({ originalname, mimetype, buffer: Buffer.from('x') }) as Express.Multer.File;

    it('rechaza un formato no permitido para el propósito', async () => {
      const svc = new UploadService(config({}));
      svc.onModuleInit();
      const folder = `reto-constancia/${CH}/${ANA}/activity`;
      await expect(svc.saveLocal(file('a.gif', 'image/gif'), folder, 'activity')).rejects.toThrow('Formato no permitido');
      await expect(svc.saveLocal(file('a.pdf', 'application/pdf'), folder, 'activity')).rejects.toThrow(BadRequestException);
    });

    it('guarda los JPEG como jpg, igual que Cloudinary', async () => {
      const svc = new UploadService(config({}));
      svc.onModuleInit();
      const folder = `reto-constancia/${CH}/${ANA}/activity`;
      const saved = await svc.saveLocal(file('foto.JPEG', 'image/jpeg'), folder, 'activity');
      expect(saved.secure_url).toMatch(new RegExp(`^http://localhost:3000/uploads/${folder}/[0-9a-f-]+[.]jpg$`));
      expect(saved.public_id.startsWith(`${folder}/`)).toBe(true);
    });

    it('el comprobante admite PDF', async () => {
      const svc = new UploadService(config({}));
      svc.onModuleInit();
      const folder = `reto-constancia/${CH}/${ANA}/payment-proof`;
      const saved = await svc.saveLocal(file('recibo.pdf', 'application/pdf'), folder, 'payment-proof');
      expect(saved.secure_url.endsWith('.pdf')).toBe(true);
    });
  });
});
