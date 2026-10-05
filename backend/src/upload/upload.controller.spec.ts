import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';

import { UploadController } from './upload.controller';

describe('UploadController: límite de firmas', () => {
  const OLD = process.env.UPLOAD_SIGN_LIMIT;
  afterEach(() => {
    process.env.UPLOAD_SIGN_LIMIT = OLD;
  });

  it('firma con límite configurable: 30 por minuto por defecto y UPLOAD_SIGN_LIMIT si está definido', () => {
    const handler = UploadController.prototype.sign;
    const limit = Reflect.getMetadata(`${THROTTLER_LIMIT}default`, handler) as () => number;
    const ttl = Reflect.getMetadata(`${THROTTLER_TTL}default`, handler);
    expect(ttl).toBe(60_000);
    delete process.env.UPLOAD_SIGN_LIMIT;
    expect(limit()).toBe(30);
    process.env.UPLOAD_SIGN_LIMIT = '5';
    expect(limit()).toBe(5);
  });
});
