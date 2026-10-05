/*
 * Reglas puras de subida (spec upload-guardrails): carpeta derivada por el servidor, formatos
 * por propósito y verificación de que una evidencia es un archivo propio.
 */

export const UPLOAD_PURPOSES = ['activity', 'payment-proof'] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

/**
 * Formatos permitidos por propósito, en orden alfabético: el cliente los reenvía tal cual y
 * Cloudinary rechaza la firma si cambian. No se lista `jpeg`: Cloudinary guarda los JPEG como
 * `jpg` (y el simulador local hace lo mismo).
 */
export const ALLOWED_FORMATS: Record<UploadPurpose, string> = {
  activity: 'heic,jpg,png,webp',
  'payment-proof': 'heic,jpg,pdf,png,webp',
};

export const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

export const FORMAT_MESSAGE =
  'Formato no permitido. Usa JPG, PNG, WEBP o HEIC (PDF solo para comprobantes)';

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const SAFE_BASE = /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/;

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/** Carpeta base sin barras al inicio ni al final. Solo letras, números, `_`, `-` y `/`. */
export function normalizeBase(base: string): string {
  const normalized = base.trim().replace(/^\/+|\/+$/g, '');
  if (!SAFE_BASE.test(normalized)) {
    throw new Error(
      `CLOUDINARY_FOLDER "${base}" no es válida: usa solo letras, números, "_", "-" y "/"`,
    );
  }
  return normalized;
}

export function folderFor(
  base: string,
  challengeId: string,
  userId: string,
  purpose: UploadPurpose,
): string {
  return `${base}/${challengeId}/${userId}/${purpose}`;
}

export interface ParsedFolder {
  challengeId: string;
  userId: string;
  purpose: UploadPurpose;
}

/** Reconoce solo carpetas derivadas: `<base>/<uuid reto>/<uuid usuario>/<propósito>`. */
export function parseFolder(base: string, folder: string): ParsedFolder | null {
  const match = new RegExp(
    `^${escapeRegExp(base)}/(${UUID})/(${UUID})/(activity|payment-proof)$`,
  ).exec(folder);
  if (!match) return null;
  return { challengeId: match[1], userId: match[2], purpose: match[3] as UploadPurpose };
}

export function allowedExtensions(purpose: UploadPurpose): string[] {
  return ALLOWED_FORMATS[purpose].split(',');
}

export interface OwnershipContext {
  base: string;
  challengeId: string;
  userId: string;
  purpose: UploadPurpose;
  /** Modo Cloudinary: nombre de la cuenta. Sin él se usa el modo local. */
  cloudName?: string;
  /** Modo local: URL pública de la API (PUBLIC_URL), con o sin path. */
  publicBaseUrl: string;
}

/**
 * Una evidencia es propia si su id está dentro de la carpeta derivada para el usuario, el reto y
 * el propósito, y su URL es exactamente la del archivo con una extensión permitida.
 */
export function isOwnedAsset(asset: { url: string; publicId: string }, ctx: OwnershipContext): boolean {
  const { url, publicId } = asset;
  const prefix = `${folderFor(ctx.base, ctx.challengeId, ctx.userId, ctx.purpose)}/`;
  if (
    typeof url !== 'string' ||
    typeof publicId !== 'string' ||
    publicId.length > 255 ||
    !publicId.startsWith(prefix) ||
    publicId.length === prefix.length ||
    publicId.includes('..') ||
    publicId.includes('\\')
  ) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.search || parsed.hash) return false;
  const exts = allowedExtensions(ctx.purpose).map(escapeRegExp).join('|');
  const id = escapeRegExp(publicId);

  if (ctx.cloudName) {
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com' || parsed.port) {
      return false;
    }
    const path = new RegExp(`^/${escapeRegExp(ctx.cloudName)}/image/upload/(v\\d+/)?${id}\\.(${exts})$`);
    return path.test(parsed.pathname);
  }

  let base: URL;
  try {
    base = new URL(ctx.publicBaseUrl);
  } catch {
    return false;
  }
  if (parsed.origin !== base.origin) return false;
  const basePath = base.pathname.replace(/\/+$/, '');
  const path = new RegExp(`^${escapeRegExp(basePath)}/uploads/${id}\\.(${exts})$`);
  return path.test(parsed.pathname);
}
