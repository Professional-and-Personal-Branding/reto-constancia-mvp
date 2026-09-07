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
  budgetTotal: '600.00',
  participants: [
    { userId: 'u1', paid: true, user: { id: 'u1', name: 'Ana', email: 'a@x' } },
    { userId: 'u2', paid: true, user: { id: 'u2', name: 'Bruno', email: 'b@x' } },
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

  it('presupuesto 0 -> premio no monetario', async () => {
    const acts = [{ userId: 'u1', status: 'VALIDATED', distanceKm: 5 }];
    const svc = new ResultsService(
      buildPrismaMock({ ...baseChallenge, budgetTotal: '0.00' }, acts),
    );
    const r = await svc.getResults('c1');
    expect(r.payout.monetary).toBe(false);
    expect(r.payout.perWinner).toBe(0);
  });
});
