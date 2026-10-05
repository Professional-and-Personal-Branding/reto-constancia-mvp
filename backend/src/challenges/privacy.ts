/*
 * Proyección por rol de las lecturas de retos y resultados (spec challenge-lifecycle,
 * challenge-scoring y challenge-finance, cambio participant-data-privacy).
 * El admin recibe todo; un participante nunca recibe el email ni el pago de otra persona.
 * Las filas se arman con listas blancas: una columna nueva no se filtra por omisión.
 */
import { UserRole } from '@prisma/client';

import { JwtPayload } from '../auth/auth.service';
import type { ChallengeWithParticipants } from './challenges.service';
import type {
  ChallengeAwardResult,
  ChallengeResults,
  ParticipantRanking,
} from './results.service';

type ParticipantRow = ChallengeWithParticipants['participants'][number];

const OWN_FIELDS = [
  'paid',
  'paidAt',
  'amountPaid',
  'paymentProofUrl',
  'paymentProofUploadedAt',
  'joinedAt',
] as const;
const RANK_FIELDS = [
  'userId',
  'name',
  'validatedDays',
  'pendingDays',
  'rejectedDays',
  'totalKm',
  'score',
  'qualified',
] as const;
const AWARD_FIELDS = ['userId', 'name', 'awardedAt', 'notes'] as const;

/** Inscripción propia de quien consulta. Nunca incluye paymentProofCloudinaryId. */
export type MyParticipation = Pick<ParticipantRow, (typeof OWN_FIELDS)[number]>;
export type PublicRankingRow = Pick<ParticipantRanking, (typeof RANK_FIELDS)[number]>;
export type PublicAwardRow = Pick<ChallengeAwardResult, (typeof AWARD_FIELDS)[number]>;

/** Admin: la respuesta de siempre más `me`. Participante: sin `participants`, con `me`. */
export type ChallengeView<C extends ChallengeWithParticipants> =
  | (C & { me: MyParticipation | null })
  | (Omit<C, 'participants'> & { me: MyParticipation | null });

export type PublicChallengeResults = Omit<
  ChallengeResults,
  'ranking' | 'tiedAtTop' | 'winners' | 'awards'
> & {
  ranking: PublicRankingRow[];
  tiedAtTop: PublicRankingRow[];
  winners: PublicRankingRow[];
  awards: PublicAwardRow[];
};

function pick<T, K extends keyof T>(source: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) out[key] = source[key];
  return out;
}

export const isAdmin = (user: JwtPayload): boolean => user.role === UserRole.ADMIN;

export function myParticipation(
  participants: ParticipantRow[],
  userId: string,
): MyParticipation | null {
  const own = participants.find((p) => p.userId === userId);
  return own ? pick(own, OWN_FIELDS) : null;
}

export function projectChallengeForViewer<C extends ChallengeWithParticipants>(
  challenge: C,
  user: JwtPayload,
): ChallengeView<C> {
  const me = myParticipation(challenge.participants, user.sub);
  if (isAdmin(user)) return { ...challenge, me };
  const { participants, ...rest } = challenge;
  void participants;
  return { ...rest, me };
}

export function projectResultsForViewer(
  results: ChallengeResults,
  user: JwtPayload,
): ChallengeResults | PublicChallengeResults {
  if (isAdmin(user)) return results;
  const row = (r: ParticipantRanking): PublicRankingRow => pick(r, RANK_FIELDS);
  return {
    ...results,
    ranking: results.ranking.map(row),
    tiedAtTop: results.tiedAtTop.map(row),
    winners: results.winners.map(row),
    awards: results.awards.map((a): PublicAwardRow => pick(a, AWARD_FIELDS)),
  };
}
