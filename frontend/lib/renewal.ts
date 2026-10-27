/**
 * Textos de la inscripción en bloque y de la renovación mensual (OpenSpec:
 * monthly-challenge-renewal). Funciones puras para poder probarlas sin la interfaz.
 */
import type { BulkEnrollResult, EnrollmentSkip } from './types.ts';

const SKIP_REASON: Record<EnrollmentSkip['reason'], string> = {
  INACTIVE: 'usuario inactivo',
  NOT_FOUND: 'usuario no encontrado',
};

/** "Luis (usuario inactivo)"; sin nombre conocido queda solo el motivo. */
function skippedLabel(skip: EnrollmentSkip, names: Record<string, string>): string {
  const reason = SKIP_REASON[skip.reason];
  const name = names[skip.userId];
  return name ? `${name} (${reason})` : reason;
}

/**
 * Resumen de una inscripción en bloque, por ejemplo
 * "3 inscritos · 1 ya estaba inscrito · 1 omitido: Luis (usuario inactivo)".
 * `names` permite nombrar a los omitidos (la API solo devuelve su id).
 */
export function bulkSummary(result: BulkEnrollResult, names: Record<string, string> = {}): string {
  const parts: string[] = [];
  const enrolled = result.enrolled.length;
  if (enrolled > 0) parts.push(`${enrolled} ${enrolled === 1 ? 'inscrito' : 'inscritos'}`);
  const already = result.alreadyEnrolled.length;
  if (already > 0) {
    parts.push(already === 1 ? '1 ya estaba inscrito' : `${already} ya estaban inscritos`);
  }
  const skipped = result.skipped.length;
  if (skipped > 0) {
    const list = result.skipped.map((s) => skippedLabel(s, names)).join(', ');
    parts.push(`${skipped} ${skipped === 1 ? 'omitido' : 'omitidos'}: ${list}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Sin cambios';
}

/** Máximo de ids que acepta `participants/bulk` por petición. */
export const BULK_BATCH_SIZE = 200;

/** Parte una lista en lotes de a lo más `size` elementos. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Une los resultados de varios lotes en uno solo. */
export function mergeBulkResults(results: BulkEnrollResult[]): BulkEnrollResult {
  return {
    enrolled: results.flatMap((r) => r.enrolled),
    alreadyEnrolled: results.flatMap((r) => r.alreadyEnrolled),
    skipped: results.flatMap((r) => r.skipped),
  };
}
