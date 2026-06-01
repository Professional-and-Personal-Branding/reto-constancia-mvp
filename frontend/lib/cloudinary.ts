import { api } from './api';
import type { CloudinarySignature } from './types';

export interface UploadedAsset {
  url: string;
  cloudinaryId: string;
}

/**
 * Sube un archivo directo a Cloudinary usando una firma del backend.
 * Devuelve la URL pública y el public_id para guardarlos en la actividad.
 */
export async function uploadToCloudinary(
  file: File,
  folder?: string,
  resourceType: 'image' | 'raw' | 'auto' = 'image',
): Promise<UploadedAsset> {
  const sig = await api<CloudinarySignature>('/upload/sign', {
    method: 'POST',
    body: { folder, resourceType },
  });

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', sig.apiKey);
  form.append('timestamp', String(sig.timestamp));
  form.append('signature', sig.signature);
  form.append('folder', sig.folder);

  const res = await fetch(sig.uploadUrl, { method: 'POST', body: form });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Cloudinary upload failed: ${txt}`);
  }
  const data = (await res.json()) as { secure_url: string; public_id: string };
  return { url: data.secure_url, cloudinaryId: data.public_id };
}
