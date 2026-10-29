/**
 * Textos de la inscripción en bloque y de la renovación mensual (OpenSpec:
 * monthly-challenge-renewal). Funciones puras para poder probarlas sin la interfaz.
 */
import type { BulkEnrollResult, EnrollmentSkip, RenewalRules } from './types.ts';

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

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const TIEBREAK_LABEL: Record<RenewalRules['tiebreakRule'], string> = {
  DRAW: 'sorteo',
  TOTAL_KM: 'más kilómetros',
  SHARE_ALL: 'comparten todos los empatados',
};

/** "Noviembre 2026" */
export function monthLabel(month: number, year: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** Aviso tras renovar: "Reto Noviembre 2026 creado en borrador con 2 inscritos". */
export function renewedMessage(name: string, enrolled: number): string {
  return `${name} creado en borrador con ${enrolled} ${enrolled === 1 ? 'inscrito' : 'inscritos'}`;
}

/** Resumen en una línea de las reglas que se copian; un presupuesto manual se marca "ajustado". */
export function rulesSummary(rules: RenewalRules): string {
  const budget =
    rules.budgetMode === 'manual'
      ? `presupuesto ajustado ${rules.budgetTotal} ${rules.currency}`
      : 'presupuesto automático';
  return [
    `días ${rules.validDays.map((d) => DAY_NAMES[d]).join(', ')}`,
    `${rules.minHeartRateMinutes} min FC mín`,
    `cuota ${rules.feePerParticipant} ${rules.currency}`,
    budget,
    `${rules.pointsPerValidatedDay} pts por día validado`,
    `${rules.pointsPerKm} pts por km`,
    `mínimo ${rules.minValidatedDaysToQualify} días para ganar`,
    `${rules.maxWinners} ${rules.maxWinners === 1 ? 'ganador' : 'ganadores'}`,
    `desempate por ${TIEBREAK_LABEL[rules.tiebreakRule]}`,
  ].join(' · ');
}

/**
 * Texto de la casilla de participantes de la renovación (D4.7): 0 no tiene casilla, 1 va en singular.
 * Con 0 devuelve el aviso de que no hay a quién inscribir.
 */
export function rosterLabel(count: number, sourceName: string): string {
  if (count === 0) return `${sourceName} no tiene participantes activos para inscribir.`;
  if (count === 1) return `Inscribir al participante activo de ${sourceName}`;
  return `Inscribir a los ${count} participantes activos de ${sourceName}`;
}
