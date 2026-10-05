import { TiebreakRule } from '@prisma/client';

import { ResultsService } from './results.service';
import { PrismaService } from '../prisma/prisma.service';

type AnyChallenge = Parameters<typeof Object.assign>[0];

function buildPrismaMock(challenge: unknown, activities: unknown[]): PrismaService {
  return {
    challenge: { findUnique: jest.fn().mockResolvedValue(challenge) },
    dailyActivity: { findMany: jest.fn().mockResolvedValue(activities) },
  } as unknown as PrismaService;
}

const baseChallenge = {
  id: 'c1',
  name: 'Reto Mayo',
  status: 'ACTIVE',
  startDate: new Date('2026-05-01T00:00:00Z'),
  endDate: new Date('2026-05-31T00:00:00Z'),
  validDays: [1, 2, 3, 4, 5, 6],
  feePerParticipant: '300.00',
  budgetTotal: null,
  // Reglas de puntaje por defecto (= comportamiento histórico)
  pointsPerValidatedDay: 1,
  pointsPerKm: '0.00',
  minValidatedDaysToQualify: 0,
  maxWinners: 2,
  tiebreakRule: TiebreakRule.DRAW,
  participants: [
    // Dos cuotas de 300 pagadas: lo recaudado (el pote) es 600
    { userId: 'u1', paid: true, amountPaid: '300.00', user: { id: 'u1', name: 'Ana', email: 'a@x' } },
    { userId: 'u2', paid: true, amountPaid: '300.00', user: { id: 'u2', name: 'Bruno', email: 'b@x' } },
  ],
  awards: [] as unknown[],
};

describe('ResultsService.getResults', () => {
  it('declara un ganador único', async () => {
    const acts = [
      { userId: 'u1', status: 'VALIDATED', distanceKm: 5 },
      { userId: 'u1', status: 'VALIDATED', distanceKm: 5 },
      { userId: 'u2', status: 'VALIDATED', distanceKm: 3 },
    ];
    const svc = new ResultsService(buildPrismaMock(baseChallenge, acts));
    const r = await svc.getResults('c1');
    expect(r.ranking[0].userId).toBe('u1');
    expect(r.topScore).toBe(2);
    expect(r.winners).toHaveLength(1);
    expect(r.winners[0].userId).toBe('u1');
    expect(r.drawNeeded).toBe(false);
    expect(r.payout).toEqual({ pot: 600, winnersCount: 1, perWinner: 600, monetary: true });
  });

  it('empate de 2 -> ambos ganan sin sorteo', async () => {
    const acts = [
      { userId: 'u1', status: 'VALIDATED', distanceKm: 5 },
      { userId: 'u2', status: 'VALIDATED', distanceKm: 3 },
    ];
    const svc = new ResultsService(buildPrismaMock(baseChallenge, acts));
    const r = await svc.getResults('c1');
    expect(r.tiedAtTop).toHaveLength(2);
    expect(r.winners).toHaveLength(2);
    expect(r.drawNeeded).toBe(false);
    expect(r.payout.perWinner).toBe(300);
    expect(r.payout.winnersCount).toBe(2);
  });

  it('sin actividades validadas -> sin ganador', async () => {
    const acts = [{ userId: 'u1', status: 'PENDING', distanceKm: 5 }];
    const svc = new ResultsService(buildPrismaMock(baseChallenge, acts));
    const r = await svc.getResults('c1');
    expect(r.topScore).toBe(0);
    expect(r.winners).toHaveLength(0);
    expect(r.payout).toEqual({ pot: 600, winnersCount: 0, perWinner: 0, monetary: true });
  });

  it('una premiación registrada manda sobre el cálculo automático', async () => {
    const challenge: AnyChallenge = {
      ...baseChallenge,
      awards: [
        {
          userId: 'u2',
          awardedAt: new Date(),
          notes: 'manual',
          user: { id: 'u2', name: 'Bruno', email: 'b@x' },
        },
      ],
    };
    const acts = [
      { userId: 'u1', status: 'VALIDATED', distanceKm: 5 },
      { userId: 'u1', status: 'VALIDATED', distanceKm: 5 },
    ];
    const svc = new ResultsService(buildPrismaMock(challenge, acts));
    const r = await svc.getResults('c1');
    expect(r.winners).toHaveLength(1);
    expect(r.winners[0].userId).toBe('u2');
    expect(r.drawNeeded).toBe(false);
    expect(r.payout.winnersCount).toBe(1);
    expect(r.payout.perWinner).toBe(600);
  });

  it('reto sin cuota -> premio no monetario', async () => {
    const acts = [{ userId: 'u1', status: 'VALIDATED', distanceKm: 5 }];
    const free = {
      ...baseChallenge,
      feePerParticipant: '0.00',
      participants: baseChallenge.participants.map((p) => ({ ...p, paid: false, amountPaid: null })),
    };
    const svc = new ResultsService(buildPrismaMock(free, acts));
    const r = await svc.getResults('c1');
    expect(r.payout.monetary).toBe(false);
    expect(r.payout.perWinner).toBe(0);
  });

  it('el pote es lo recaudado y no depende del presupuesto', async () => {
    const acts = [{ userId: 'u1', status: 'VALIDATED', distanceKm: 5 }];
    // Solo Ana pagó: el pote es 300 tenga el reto presupuesto automático o 900 fijado a mano
    const participants = [baseChallenge.participants[0], { ...baseChallenge.participants[1], paid: false, amountPaid: null }];
    for (const budgetTotal of [null, '900.00']) {
      const svc = new ResultsService(buildPrismaMock({ ...baseChallenge, budgetTotal, participants }, acts));
      const r = await svc.getResults('c1');
      expect(r.payout).toEqual({ pot: 300, winnersCount: 1, perWinner: 300, monetary: true });
    }
  });

  it('quien no pagó puede ganar y cobra como cualquier ganador', async () => {
    const acts = [
      { userId: 'u1', status: 'VALIDATED', distanceKm: 5 },
      { userId: 'u1', status: 'VALIDATED', distanceKm: 5 },
      { userId: 'u2', status: 'VALIDATED', distanceKm: 5 },
    ];
    const participants = [{ ...baseChallenge.participants[0], paid: false, amountPaid: null }, baseChallenge.participants[1]];
    const svc = new ResultsService(buildPrismaMock({ ...baseChallenge, participants }, acts));
    const r = await svc.getResults('c1');
    expect(r.winners.map((w) => w.userId)).toEqual(['u1']);
    expect(r.payout).toEqual({ pot: 300, winnersCount: 1, perWinner: 300, monetary: true });
  });
});

describe('ResultsService con reglas de puntaje configurables', () => {
  const acts = [
    { userId: 'u1', status: 'VALIDATED', distanceKm: 5 },
    { userId: 'u1', status: 'VALIDATED', distanceKm: 5 },
    { userId: 'u2', status: 'VALIDATED', distanceKm: 20 },
  ];

  it('los kilómetros suman puntos y reordenan el ranking', async () => {
    const challenge: AnyChallenge = {
      ...baseChallenge,
      pointsPerValidatedDay: 10,
      pointsPerKm: '1.00',
    };
    const svc = new ResultsService(buildPrismaMock(challenge, acts));
    const r = await svc.getResults('c1');
    // u1: 2 días x10 + 10 km = 30 · u2: 1 día x10 + 20 km = 30 -> empate, gana el de más km
    expect(r.ranking.map((x) => x.score)).toEqual([30, 30]);
    expect(r.ranking[0].userId).toBe('u2');
    expect(r.winners).toHaveLength(2);
    expect(r.notes.join(' ')).toMatch(/10 por día validado/);
  });

  it('el mínimo de días validados deja fuera al puntero y sin ganador', async () => {
    const challenge: AnyChallenge = { ...baseChallenge, minValidatedDaysToQualify: 5 };
    const svc = new ResultsService(buildPrismaMock(challenge, acts));
    const r = await svc.getResults('c1');
    expect(r.ranking.every((x) => x.qualified === false)).toBe(true);
    expect(r.winners).toHaveLength(0);
    expect(r.payout.winnersCount).toBe(0);
    expect(r.notes.join(' ')).toMatch(/Mínimo para calificar/);
  });

  it('maxWinners = 1 con desempate por kilómetros elige al de más km', async () => {
    const challenge: AnyChallenge = {
      ...baseChallenge,
      maxWinners: 1,
      tiebreakRule: TiebreakRule.TOTAL_KM,
    };
    const svc = new ResultsService(
      buildPrismaMock(challenge, [
        { userId: 'u1', status: 'VALIDATED', distanceKm: 5 },
        { userId: 'u2', status: 'VALIDATED', distanceKm: 20 },
      ]),
    );
    const r = await svc.getResults('c1');
    expect(r.tiedAtTop).toHaveLength(2);
    expect(r.winners.map((w) => w.userId)).toEqual(['u2']);
    expect(r.drawNeeded).toBe(false);
    expect(r.payout.perWinner).toBe(600);
  });

  it('SHARE_ALL reparte entre todos los empatados aunque superen el cupo', async () => {
    const challenge: AnyChallenge = {
      ...baseChallenge,
      maxWinners: 1,
      tiebreakRule: TiebreakRule.SHARE_ALL,
    };
    const svc = new ResultsService(
      buildPrismaMock(challenge, [
        { userId: 'u1', status: 'VALIDATED', distanceKm: 5 },
        { userId: 'u2', status: 'VALIDATED', distanceKm: 5 },
      ]),
    );
    const r = await svc.getResults('c1');
    expect(r.winners).toHaveLength(2);
    expect(r.drawNeeded).toBe(false);
    expect(r.payout.perWinner).toBe(300);
  });
});

describe('ResultsService: sorteo guardado al cierre (closed-challenge-freeze)', () => {
  const tiedActs = [
    { userId: 'u1', status: 'VALIDATED', distanceKm: 5 },
    { userId: 'u2', status: 'VALIDATED', distanceKm: 5 },
    { userId: 'u3', status: 'VALIDATED', distanceKm: 5 },
  ];
  const three = {
    ...baseChallenge,
    status: 'COMPLETED',
    maxWinners: 1,
    participants: [
      ...baseChallenge.participants,
      { userId: 'u3', paid: false, amountPaid: null, user: { id: 'u3', name: 'Carla', email: 'c@x' } },
    ],
  };
  const award = (userId: string, notes: string) => ({
    userId,
    notes,
    awardedAt: new Date('2026-06-01T00:00:00Z'),
    user: { id: userId, name: userId, email: `${userId}@x` },
  });

  it('con las awards del sorteo automático: ganadores fijos, sin sorteo y con su nota', async () => {
    const challenge = { ...three, awards: [award('u2', 'Sorteo automático al cierre')] };
    const svc = new ResultsService(buildPrismaMock(challenge, tiedActs));
    for (let i = 0; i < 5; i++) {
      const r = await svc.getResults('c1');
      expect(r.winners.map((w) => w.userId)).toEqual(['u2']);
      expect(r.drawNeeded).toBe(false);
      expect(r.notes).toContain('Ganadores definidos por sorteo automático al cierre.');
    }
  });

  it('con una premiación del admin la nota sigue siendo la de siempre', async () => {
    const challenge = { ...three, awards: [award('u3', 'Sorteo presencial')] };
    const r = await new ResultsService(buildPrismaMock(challenge, tiedActs)).getResults('c1');
    expect(r.notes).toContain('Premiación registrada por el administrador.');
  });

  it('computeResults lee con el cliente que recibe (la transacción del cierre)', async () => {
    const tx = buildPrismaMock(three, tiedActs);
    const other = buildPrismaMock(null, []);
    const r = await new ResultsService(other).computeResults(tx, 'c1');
    expect(r.tiedAtTop).toHaveLength(3);
    expect(r.drawNeeded).toBe(true);
  });
});
