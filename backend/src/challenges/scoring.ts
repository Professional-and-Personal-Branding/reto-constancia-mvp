import { TiebreakRule } from '@prisma/client';

/**
 * Reglas de puntaje configurables por reto (spec: challenge-scoring).
 * Funciones puras: `ResultsService` solo carga datos y mapea.
 *
 * Los defaults del modelo (1 punto por día validado, 0 por km, sin mínimo, 2 ganadores,
 * desempate por sorteo) reproducen exactamente el comportamiento histórico.
 */
type Numeric = number | string | { toString(): string } | null | undefined;

export interface ScoringRules {
  pointsPerValidatedDay: Numeric;
  pointsPerKm: Numeric;
  minValidatedDaysToQualify: number;
  maxWinners: number;
  tiebreakRule: TiebreakRule;
}

export interface ScoreInput {
  validatedDays: number;
  totalKm: number;
}

export interface TiebreakCandidate {
  totalKm: number;
}

export interface WinnerSelection<T> {
  winners: T[];
  drawNeeded: boolean;
  notes: string[];
}

function num(value: Numeric): number {
  if (value === null || value === undefined) return 0;
  const n = Number(typeof value === 'object' ? value.toString() : value);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** puntaje = días validados x puntos por día + km x puntos por km (2 decimales). */
export function computeScore(rules: ScoringRules, input: ScoreInput): number {
  return round2(
    input.validatedDays * num(rules.pointsPerValidatedDay) +
      input.totalKm * num(rules.pointsPerKm),
  );
}

/** Califica quien alcanza el mínimo de días validados y tiene puntaje mayor a cero. */
export function isQualified(
  rules: ScoringRules,
  input: { validatedDays: number; score: number },
): boolean {
  return input.validatedDays >= (rules.minValidatedDaysToQualify ?? 0) && input.score > 0;
}

/** Describe la regla de puntaje activa para mostrarla en resultados. */
export function describeScoring(rules: ScoringRules): string | null {
  const perDay = num(rules.pointsPerValidatedDay);
  const perKm = num(rules.pointsPerKm);
  const min = rules.minValidatedDaysToQualify ?? 0;
  const parts: string[] = [];
  if (perDay !== 1 || perKm !== 0) {
    parts.push(
      `Puntaje: ${perDay} por día validado` + (perKm > 0 ? ` + ${perKm} por km` : ''),
    );
  }
  if (min > 0) parts.push(`Mínimo para calificar: ${min} días validados`);
  return parts.length > 0 ? parts.join('. ') + '.' : null;
}

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

/**
 * Elige ganadores entre los empatados en el tope aplicando `maxWinners` y `tiebreakRule`.
 * Si empatan menos (o igual) que los cupos, ganan todos sin desempate.
 */
export function selectWinners<T extends TiebreakCandidate>(
  tied: T[],
  rules: ScoringRules,
): WinnerSelection<T> {
  const notes: string[] = [];
  const maxWinners = Math.max(1, Math.trunc(rules.maxWinners ?? 2));

  if (tied.length === 0) {
    notes.push('Aún no hay participantes que califiquen, sin ganador definido.');
    return { winners: [], drawNeeded: false, notes };
  }

  if (tied.length === 1) {
    notes.push('Ganador único, sin empate.');
    return { winners: tied, drawNeeded: false, notes };
  }

  if (tied.length <= maxWinners) {
    notes.push(
      `Empate de ${tied.length} personas dentro del cupo de ${maxWinners}: ganan todas y el presupuesto se divide.`,
    );
    return { winners: tied, drawNeeded: false, notes };
  }

  if (rules.tiebreakRule === TiebreakRule.SHARE_ALL) {
    notes.push(
      `Empate de ${tied.length} personas: la regla del reto reparte el premio entre todas.`,
    );
    return { winners: tied, drawNeeded: false, notes };
  }

  if (rules.tiebreakRule === TiebreakRule.TOTAL_KM) {
    const sorted = [...tied].sort((a, b) => b.totalKm - a.totalKm);
    const cutKm = sorted[maxWinners - 1].totalKm;
    const above = sorted.filter((c) => c.totalKm > cutKm);
    const atCut = sorted.filter((c) => c.totalKm === cutKm);
    const seats = maxWinners - above.length;

    if (atCut.length <= seats) {
      notes.push(
        `Empate de ${tied.length} personas: se desempató por kilómetros acumulados. Ganan ${maxWinners}.`,
      );
      return { winners: [...above, ...atCut], drawNeeded: false, notes };
    }

    notes.push(
      `Empate de ${tied.length} personas: se desempató por kilómetros y ${atCut.length} siguen empatadas en ${cutKm} km, ` +
        `así que se sorteó entre ellas. Ganan ${maxWinners}.`,
    );
    return {
      winners: [...above, ...shuffle(atCut).slice(0, seats)],
      drawNeeded: true,
      notes,
    };
  }

  notes.push(
    `Empate de ${tied.length} personas: se hizo sorteo aleatorio entre las empatadas. Ganan ${maxWinners}.`,
  );
  return { winners: shuffle(tied).slice(0, maxWinners), drawNeeded: true, notes };
}
