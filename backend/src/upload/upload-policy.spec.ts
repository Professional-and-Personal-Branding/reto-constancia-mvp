import {
  ALLOWED_FORMATS,
  folderFor,
  isOwnedAsset,
  normalizeBase,
  OwnershipContext,
  parseFolder,
} from './upload-policy';

const CH = '11111111-1111-4111-8111-111111111111';
const OTHER_CH = '22222222-2222-4222-8222-222222222222';
const ANA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BETO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BASE = 'reto-constancia';

const cloud: OwnershipContext = {
  base: BASE,
  challengeId: CH,
  userId: ANA,
  purpose: 'activity',
  cloudName: 'demo',
  publicBaseUrl: 'http://localhost:3000',
};
const local: OwnershipContext = { ...cloud, cloudName: undefined };
const id = (purpose = 'activity', user = ANA, challenge = CH) => `${BASE}/${challenge}/${user}/${purpose}/abc123`;
const cloudUrl = (publicId: string, ext = 'jpg', version = 'v17/') =>
  `https://res.cloudinary.com/demo/image/upload/${version}${publicId}.${ext}`;

describe('formatos y carpetas', () => {
  it('formatos exactos por propósito, en orden alfabético', () => {
    expect(ALLOWED_FORMATS).toEqual({ activity: 'heic,jpg,png,webp', 'payment-proof': 'heic,jpg,pdf,png,webp' });
  });

  it('la carpeta incluye el reto, el usuario y el propósito', () => {
    expect(folderFor(BASE, CH, ANA, 'payment-proof')).toBe(`${BASE}/${CH}/${ANA}/payment-proof`);
  });

  it('parseFolder reconoce solo carpetas derivadas', () => {
    expect(parseFolder(BASE, `${BASE}/${CH}/${ANA}/activity`)).toEqual({ challengeId: CH, userId: ANA, purpose: 'activity' });
    for (const bad of [`${BASE}`, `${BASE}/2026-05`, `${BASE}/${CH}/${ANA}/otro`, `otra/${CH}/${ANA}/activity`, `${BASE}/${CH}/${ANA}/activity/x`]) {
      expect(parseFolder(BASE, bad)).toBeNull();
    }
  });

  it('normalizeBase quita barras y rechaza caracteres que romperían las carpetas', () => {
    expect(normalizeBase('/reto-constancia/')).toBe('reto-constancia');
    expect(normalizeBase('apps/reto_v2')).toBe('apps/reto_v2');
    expect(() => normalizeBase('reto constancia')).toThrow(/CLOUDINARY_FOLDER/);
    expect(() => normalizeBase('reto.prod')).toThrow(/CLOUDINARY_FOLDER/);
  });
});

describe('isOwnedAsset en modo Cloudinary', () => {
  it('acepta el archivo propio con y sin versión', () => {
    expect(isOwnedAsset({ url: cloudUrl(id()), publicId: id() }, cloud)).toBe(true);
    expect(isOwnedAsset({ url: cloudUrl(id(), 'png', ''), publicId: id() }, cloud)).toBe(true);
  });

  it.each([
    ['otro host', `https://evil.com/demo/image/upload/${id()}.jpg`],
    ['un host que solo empieza igual', `https://res.cloudinary.com.evil.com/demo/image/upload/${id()}.jpg`],
    ['otra cuenta', `https://res.cloudinary.com/otra/image/upload/${id()}.jpg`],
    ['http', cloudUrl(id()).replace('https:', 'http:')],
    ['la URL de otro archivo', cloudUrl(`${BASE}/${CH}/${ANA}/activity/otro`)],
    ['un PDF en una actividad', cloudUrl(id(), 'pdf')],
    ['la extensión jpeg', cloudUrl(id(), 'jpeg')],
    ['una query', `${cloudUrl(id())}?x=1`],
  ])('rechaza %s', (_name, url) => {
    expect(isOwnedAsset({ url, publicId: id() }, cloud)).toBe(false);
  });

  it.each([
    ['otro reto', id('activity', ANA, OTHER_CH)],
    ['otro usuario', id('activity', BETO)],
    ['otro propósito', id('payment-proof')],
    ['un id con ..', `${BASE}/${CH}/${ANA}/activity/../x`],
    ['la carpeta sin archivo', `${BASE}/${CH}/${ANA}/activity/`],
  ])('rechaza el id de %s', (_name, publicId) => {
    expect(isOwnedAsset({ url: cloudUrl(publicId), publicId }, cloud)).toBe(false);
  });

  it('un comprobante acepta PDF', () => {
    const proof = id('payment-proof');
    expect(isOwnedAsset({ url: cloudUrl(proof, 'pdf'), publicId: proof }, { ...cloud, purpose: 'payment-proof' })).toBe(true);
  });
});

describe('isOwnedAsset en modo local', () => {
  it('acepta la URL local del archivo propio', () => {
    expect(isOwnedAsset({ url: `http://localhost:3000/uploads/${id()}.png`, publicId: id() }, local)).toBe(true);
  });

  it('respeta un PUBLIC_URL con path', () => {
    const ctx = { ...local, publicBaseUrl: 'https://api.example.org/reto/' };
    expect(isOwnedAsset({ url: `https://api.example.org/reto/uploads/${id()}.png`, publicId: id() }, ctx)).toBe(true);
    expect(isOwnedAsset({ url: `https://api.example.org/uploads/${id()}.png`, publicId: id() }, ctx)).toBe(false);
  });

  it('rechaza otro origen', () => {
    expect(isOwnedAsset({ url: `http://localhost:4000/uploads/${id()}.png`, publicId: id() }, local)).toBe(false);
    expect(isOwnedAsset({ url: `https://example.com/uploads/${id()}.png`, publicId: id() }, local)).toBe(false);
  });

  it('la carpeta derivada no cambia con el saneado del simulador', () => {
    const folder = folderFor(BASE, CH, ANA, 'activity');
    expect(folder.replace(/[^a-zA-Z0-9/_-]/g, '_')).toBe(folder);
  });
});
