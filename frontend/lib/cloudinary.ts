import { api, ApiError, getTokens } from './api';
import type { CloudinarySignature, UploadPurpose } from './types';
import { sizeMessage, storageErrorMessage } from './upload-errors';

export interface UploadedAsset {
  url: string;
  cloudinaryId: string;
}

/** Tipos que ofrecen los selectores de archivo, alineados con los formatos firmados. */
export const ACCEPT: Record<UploadPurpose, string> = {
  activity: 'image/jpeg,image/png,image/webp,image/heic,.heic',
  'payment-proof': 'image/jpeg,image/png,image/webp,image/heic,.heic,application/pdf',
};

function apiMessage(e: unknown): string | null {
  if (!(e instanceof ApiError)) return null;
  const message = (e.body as { message?: string | string[] } | null)?.message;
  if (Array.isArray(message)) return message.join(', ');
  return message ?? null;
}

/**
 * Sube un archivo directo a Cloudinary (o al simulador local) con una firma del backend.
 * La carpeta la decide el servidor según el reto y el propósito (spec upload-guardrails).
 * Devuelve la URL pública y el public_id para guardarlos en la actividad o el comprobante.
 */
export async function uploadToCloudinary(
  file: File,
  challengeId: string,
  purpose: UploadPurpose,
): Promise<UploadedAsset> {
  let sig: CloudinarySignature;
  try {
    sig = await api<CloudinarySignature>('/upload/sign', {
      method: 'POST',
      body: { challengeId, purpose },
    });
  } catch (e) {
    const message = apiMessage(e);
    throw message ? new Error(message) : e;
  }

  if (file.size > sig.maxBytes) throw new Error(sizeMessage(sig.maxBytes));

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', sig.apiKey);
  form.append('timestamp', String(sig.timestamp));
  form.append('signature', sig.signature);
  form.append('folder', sig.folder);
  // Tal cual llegó: si cambia, Cloudinary rechaza la firma
  form.append('allowed_formats', sig.allowedFormats);

  // El simulador local vive en nuestra propia API y exige sesión; a Cloudinary jamás
  // se le envía el token del usuario.
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';
  const isLocalSimulator = !!apiBase && sig.uploadUrl.startsWith(apiBase);
  const token = isLocalSimulator ? getTokens()?.accessToken : undefined;

  const res = await fetch(sig.uploadUrl, {
    method: 'POST',
    body: form,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    throw new Error(storageErrorMessage(res.status, await res.text(), sig.maxBytes));
  }
  const data = (await res.json()) as { secure_url: string; public_id: string };
  return { url: data.secure_url, cloudinaryId: data.public_id };
}
