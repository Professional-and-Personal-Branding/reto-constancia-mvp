/**
 * Regla de frecuencia cardíaca (spec: activity-heart-rate-compliance).
 *
 * Una actividad cumple cuando el reto no exige mínimo (`minHeartRateMinutes <= 0`) o cuando
 * tiene `heartRateMinutes` >= mínimo y cuenta con captura de FC (`hasHeartRateProof`).
 * Función pura: la usan el registro, la validación, los listados y la importación.
 */
export interface HeartRateRule {
  minHeartRateMinutes: number;
}

export interface HeartRateInput {
  heartRateMinutes: number | null | undefined;
  hasHeartRateProof: boolean;
}

export interface HeartRateAssessment {
  compliant: boolean;
  reasons: string[];
}

export function assessHeartRate(
  rule: HeartRateRule,
  activity: HeartRateInput,
): HeartRateAssessment {
  const min = rule.minHeartRateMinutes ?? 0;
  if (min <= 0) return { compliant: true, reasons: [] };

  const reasons: string[] = [];
  if (activity.heartRateMinutes === null || activity.heartRateMinutes === undefined) {
    reasons.push(`Falta indicar los minutos con FC (este reto exige al menos ${min} min)`);
  } else if (activity.heartRateMinutes < min) {
    reasons.push(
      `Se requieren al menos ${min} min de registro de FC (indicaste ${activity.heartRateMinutes})`,
    );
  }
  if (!activity.hasHeartRateProof) {
    reasons.push('Falta la captura de frecuencia cardíaca');
  }
  return { compliant: reasons.length === 0, reasons };
}
