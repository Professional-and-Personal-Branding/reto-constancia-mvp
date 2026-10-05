import { ChallengeStatus, Prisma, UserRole } from '@prisma/client';

import { JwtPayload } from '../auth/auth.service';
import type { ChallengeWithParticipants } from './challenges.service';
import {
  myParticipation,
  projectChallengeForViewer,
  projectResultsForViewer,
} from './privacy';
import type { ChallengeResults, ParticipantRanking } from './results.service';

const OWN_KEYS = [
  'amountPaid',
  'joinedAt',
  'paid',
  'paidAt',
  'paymentProofUploadedAt',
  'paymentProofUrl',
];
const RANK_KEYS = [
  'name',
  'pendingDays',
  'qualified',
  'rejectedDays',
  'score',
  'totalKm',
  'userId',
  'validatedDays',
];
const AWARD_KEYS = ['awardedAt', 'name', 'notes', 'userId'];

const admin: JwtPayload = { sub: 'admin', email: 'admin@x', role: UserRole.ADMIN };
const ana: JwtPayload = { sub: 'ana', email: 'ana@x', role: UserRole.PARTICIPANT };
const outsider: JwtPayload = { sub: 'zoe', email: 'zoe@x', role: UserRole.PARTICIPANT };

function row(userId: string, paid: boolean) {
  return {
    id: `p-${userId}`,
    challengeId: 'c1',
    userId,
    joinedAt: new Date('2026-05-01T00:00:00Z'),
    paid,
    paidAt: paid ? new Date('2026-05-02T00:00:00Z') : null,
    amountPaid: paid ? new Prisma.Decimal(120) : null,
    paymentProofUrl: paid ? `https://cdn/${userId}.jpg` : null,
    paymentProofCloudinaryId: paid ? `payments/${userId}` : null,
    paymentProofUploadedAt: paid ? new Date('2026-05-02T00:00:00Z') : null,
    user: { id: userId, name: userId.toUpperCase(), email: `${userId}@x` },
  };
}

function challenge(isParticipant: boolean) {
  return {
    id: 'c1',
    name: 'Reto Mayo',
    status: ChallengeStatus.ACTIVE,
    participants: [row('ana', true), row('bruno', false)],
    isParticipant,
  } as unknown as ChallengeWithParticipants & { isParticipant: boolean };
}

function rank(userId: string, paid: boolean): ParticipantRanking {
  return {
    userId,
    name: userId.toUpperCase(),
    email: `${userId}@x`,
    validatedDays: 10,
    pendingDays: 1,
    rejectedDays: 0,
    totalKm: 42,
    paid,
    score: 52,
    qualified: true,
  };
}

function results(): ChallengeResults {
  const ranking = [rank('bruno', false), rank('ana', true)];
  return {
    challengeId: 'c1',
    challengeName: 'Reto Mayo',
    status: ChallengeStatus.ACTIVE,
    totalValidDays: 26,
    ranking,
    topScore: 52,
    tiedAtTop: ranking,
    winners: [ranking[0]],
    awards: [
      {
        userId: 'bruno',
        name: 'BRUNO',
        email: 'bruno@x',
        awardedAt: new Date('2026-06-01T00:00:00Z'),
        notes: 'premio',
      },
    ],
    drawNeeded: true,
    notes: ['empate'],
    payout: { monetary: true, pot: 120, winnersCount: 1, perWinner: 120 },
  };
}

describe('myParticipation', () => {
  it('devuelve solo los seis campos propios, sin el id de Cloudinary', () => {
    const me = myParticipation(challenge(true).participants, 'ana');
    expect(Object.keys(me!).sort()).toEqual(OWN_KEYS);
    expect(me!.paymentProofUrl).toBe('https://cdn/ana.jpg');
  });

  it('null si no está inscrito', () => {
    expect(myParticipation(challenge(false).participants, 'zoe')).toBeNull();
  });
});

describe('projectChallengeForViewer', () => {
  it('admin: participants intactos más me', () => {
    const input = challenge(false);
    const out = projectChallengeForViewer(input, admin);
    expect('participants' in out && out.participants).toEqual(input.participants);
    expect(out.me).toBeNull();
    expect(out.isParticipant).toBe(false);
  });

  it('admin inscrito: también recibe su propio me', () => {
    const input = challenge(true);
    const out = projectChallengeForViewer(input, { ...admin, sub: 'ana' });
    expect('participants' in out).toBe(true);
    expect(Object.keys(out.me!).sort()).toEqual(OWN_KEYS);
  });

  it('participante inscrito: sin participants, con su me e isParticipant', () => {
    const out = projectChallengeForViewer(challenge(true), ana);
    expect('participants' in out).toBe(false);
    expect(Object.keys(out.me!).sort()).toEqual(OWN_KEYS);
    expect(out.me!.paid).toBe(true);
    expect(out.isParticipant).toBe(true);
    expect(JSON.stringify(out)).not.toContain('@x');
    expect(JSON.stringify(out)).not.toContain('payments/');
  });

  it('participante no inscrito: me null y sin participants', () => {
    const out = projectChallengeForViewer(challenge(false), outsider);
    expect('participants' in out).toBe(false);
    expect(out.me).toBeNull();
    expect(out.isParticipant).toBe(false);
  });

  it('una columna nueva del inscrito no se filtra en me', () => {
    const input = challenge(true);
    (input.participants[0] as unknown as Record<string, unknown>).secret = 'x';
    const out = projectChallengeForViewer(input, ana);
    expect(out.me).not.toHaveProperty('secret');
  });
});

describe('projectResultsForViewer', () => {
  it('admin: la misma respuesta, sin copiar', () => {
    const input = results();
    expect(projectResultsForViewer(input, admin)).toBe(input);
  });

  it('participante: filas con lista blanca y sin email ni pago', () => {
    const out = projectResultsForViewer(results(), ana);
    for (const list of [out.ranking, out.tiedAtTop, out.winners]) {
      for (const r of list) expect(Object.keys(r).sort()).toEqual(RANK_KEYS);
    }
    for (const a of out.awards) expect(Object.keys(a).sort()).toEqual(AWARD_KEYS);
    expect(JSON.stringify(out)).not.toContain('@x');
    expect(JSON.stringify(out)).not.toContain('"paid"');
  });

  it('participante: nivel superior, valores y orden idénticos al del admin', () => {
    const input = results();
    const out = projectResultsForViewer(input, ana);
    expect(Object.keys(out).sort()).toEqual(Object.keys(input).sort());
    for (const key of [
      'challengeId',
      'challengeName',
      'status',
      'totalValidDays',
      'topScore',
      'drawNeeded',
      'notes',
      'payout',
    ] as const) {
      expect(JSON.stringify(out[key])).toBe(JSON.stringify(input[key]));
    }
    for (const key of ['ranking', 'tiedAtTop', 'winners'] as const) {
      expect(out[key].map((r) => r.userId)).toEqual(input[key].map((r) => r.userId));
    }
  });

  it('una columna nueva del ranking no se filtra', () => {
    const input = results();
    (input.ranking[0] as unknown as Record<string, unknown>).secret = 'x';
    const out = projectResultsForViewer(input, ana);
    expect(out.ranking[0]).not.toHaveProperty('secret');
  });
});
