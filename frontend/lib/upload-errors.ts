/**
 * Mensajes en español para los errores de subida (spec upload-guardrails).
 * Cloudinary responde en inglés y el simulador local en español; la web muestra siempre
 * el mismo texto para el mismo problema.
 */
export const FORMAT_MESSAGE =
  'Formato no permitido. Usa JPG, PNG, WEBP o HEIC (PDF solo para comprobantes)';

export function sizeMessage(maxBytes: number): string {
  return `El archivo supera el tamaño máximo (${Math.round(maxBytes / (1024 * 1024))} MB)`;
}

/** Traduce la respuesta de error del almacenamiento (Cloudinary o el simulador). */
export function storageErrorMessage(status: number, text: string, maxBytes: number): string {
  const lower = text.toLowerCase();
  if (status === 413 || lower.includes('file size too large') || lower.includes('too large')) {
    return sizeMessage(maxBytes);
  }
  if (lower.includes('format') || lower.includes('not allowed') || lower.includes('formato')) {
    return FORMAT_MESSAGE;
  }
  // El simulador local ya responde en español: se muestra su mensaje
  try {
    const parsed = JSON.parse(text) as { message?: unknown; error?: { message?: unknown } };
    const message = parsed.message ?? parsed.error?.message;
    if (typeof message === 'string' && message) return message;
  } catch {
    // respuesta no JSON
  }
  return 'No se pudo subir el archivo. Intenta de nuevo.';
}
