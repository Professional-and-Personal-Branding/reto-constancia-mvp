import { BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
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

describe('UploadService: borrado y limpieza (upload-asset-cleanup)', () => {
  const ID = 'reto-constancia/11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/activity/foto';
  afterEach(() => jest.restoreAllMocks());

  describe('deleteAsset en Cloudinary', () => {
    function cloud() {
      const svc = new UploadService(config(cloudinaryEnv));
      svc.onModuleInit();
      return svc;
    }
    it('ok es borrado, not found es no existía, otro resultado lanza y los errores de red se propagan', async () => {
      const destroy = jest.spyOn(cloudinary.uploader, 'destroy');
      destroy.mockResolvedValueOnce({ result: 'ok' });
      await expect(cloud().deleteAsset(ID)).resolves.toBe('deleted');
      expect(destroy).toHaveBeenCalledWith(ID, { resource_type: 'image', invalidate: true });
      destroy.mockResolvedValueOnce({ result: 'not found' });
      await expect(cloud().deleteAsset(ID)).resolves.toBe('not_found');
      destroy.mockResolvedValueOnce({ result: 'error' });
      await expect(cloud().deleteAsset(ID)).rejects.toThrow('destroy respondió error');
      destroy.mockRejectedValueOnce(new Error('red caída'));
      await expect(cloud().deleteAsset(ID)).rejects.toThrow('red caída');
    });
  });

  describe('deleteAsset en modo local', () => {
    function local() {
      const svc = new UploadService(config({}));
      svc.onModuleInit();
      return svc;
    }
    it('borra el archivo del id con su extensión', async () => {
      jest.spyOn(fs, 'readdir').mockResolvedValue(['otra.png', 'foto.jpg'] as never);
      const rm = jest.spyOn(fs, 'rm').mockResolvedValue(undefined);
      await expect(local().deleteAsset(ID)).resolves.toBe('deleted');
      expect(String(rm.mock.calls[0][0]).replace(/\\/g, '/')).toMatch(/activity\/foto\.jpg$/);
    });

    it('sin archivo o sin carpeta responde no existía', async () => {
      jest.spyOn(fs, 'readdir').mockResolvedValueOnce(['otra.png'] as never);
      await expect(local().deleteAsset(ID)).resolves.toBe('not_found');
      jest.spyOn(fs, 'readdir').mockRejectedValueOnce(Object.assign(new Error('no'), { code: 'ENOENT' }));
      await expect(local().deleteAsset(ID)).resolves.toBe('not_found');
    });

    it('nunca sale de la carpeta de subidas', async () => {
      const rm = jest.spyOn(fs, 'rm').mockResolvedValue(undefined);
      await expect(local().deleteAsset('../../etc/passwd')).rejects.toThrow('fuera de la carpeta de subidas');
      expect(rm).not.toHaveBeenCalled();
    });
  });

  describe('deleteAssetsLater', () => {
    function withPrisma(counts: { photos?: number; proofs?: number } = {}) {
      const prisma = {
        activityPhoto: { count: jest.fn().mockResolvedValue(counts.photos ?? 0) },
        challengeParticipant: { count: jest.fn().mockResolvedValue(counts.proofs ?? 0) },
      };
      const svc = new UploadService(config({}), prisma as never);
      svc.onModuleInit();
      const del = jest.spyOn(svc, 'deleteAsset');
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      return { svc, del, warn, prisma };
    }

    it('nunca lanza: un fallo de almacenamiento queda como aviso con el id', async () => {
      const { svc, del, warn } = withPrisma();
      del.mockRejectedValue(new Error('caído'));
      await expect(svc.deleteAssetsLater([ID])).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain(ID);
    });

    it('no existía no es un aviso', async () => {
      const { svc, del, warn } = withPrisma();
      del.mockResolvedValue('not_found');
      await svc.deleteAssetsLater([ID]);
      expect(warn).not.toHaveBeenCalled();
    });

    it('conserva un archivo que otra foto o un comprobante siguen usando', async () => {
      for (const counts of [{ photos: 1 }, { proofs: 1 }]) {
        const { svc, del } = withPrisma(counts);
        await svc.deleteAssetsLater([ID]);
        expect(del).not.toHaveBeenCalled();
      }
    });

    it('ignora las fotos importadas y los ids repetidos', async () => {
      const { svc, del, prisma } = withPrisma();
      del.mockResolvedValue('deleted');
      await svc.deleteAssetsLater(['import/u1/2026-05-04', ID, ID]);
      expect(del).toHaveBeenCalledTimes(1);
      expect(del).toHaveBeenCalledWith(ID);
      expect(prisma.activityPhoto.count).toHaveBeenCalledTimes(1);
    });
  });
});
