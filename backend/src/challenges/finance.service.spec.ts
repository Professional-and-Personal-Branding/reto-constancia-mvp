import { NotFoundException } from '@nestjs/common';

import {
  collectedTotal,
  computeFinance,
  computePayout,
  effectiveBudget,
  FinanceParticipantInput,
  FinanceService,
  paymentState,
} from './finance.service';
import { PrismaService } from '../prisma/prisma.service';

const challenge = {
  id: 'c1',
  name: 'Reto Mayo',
  currency: 'BOB',
  feePerParticipant: '120.00', // Prisma Decimal serializa como string
  budgetTotal: '600.00',
};

function participant(
  userId: string,
  paid: boolean,
  amountPaid: number | string | null,
): FinanceParticipantInput {
  return {
    userId,
    paid,
    amountPaid,
    paidAt: paid ? new Date('2026-05-02T00:00:00Z') : null,
    user: { name: userId.toUpperCase(), email: `${userId}@x` },
  };
}

describe('paymentState', () => {
  it('pagado completo, parcial e impago', () => {
    expect(paymentState(120, true, 120)).toBe('paid');
    expect(paymentState(120, true, 60)).toBe('partial');
    expect(paymentState(120, false, 0)).toBe('unpaid');
  });

  it('con cuota 0 todos están pagados', () => {
    expect(paymentState(0, false, 0)).toBe('paid');
  });
});

describe('computeFinance', () => {
  it('pagos mixtos: 3 completos, 1 parcial, 1 impago', () => {
    const f = computeFinance(challenge, [
      participant('u1', true, 120),
      participant('u2', true, '120.00'),
      participant('u3', true, 120),
      participant('u4', true, 60),
      participant('u5', false, null),
    ]);
    expect(f.participantsTotal).toBe(5);
    expect(f.expectedTotal).toBe(600);
    expect(f.collectedTotal).toBe(420);
    expect(f.pendingTotal).toBe(180);
    expect(f.budgetCovered).toBe(false);
    expect(f.budgetDelta).toBe(-180);
    expect(f.budgetTotal).toBe(600);
    expect(f.budgetMode).toBe('manual');
    expect(f.counts).toEqual({ paid: 3, partial: 1, unpaid: 1 });
    expect(f.participants.map((p) => p.state)).toEqual([
      'paid',
      'paid',
      'paid',
      'partial',
      'unpaid',
    ]);
    expect(f.currency).toBe('BOB');
  });

  it('presupuesto cubierto con excedente', () => {
    const f = computeFinance(
      challenge,
      ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'].map((u) => participant(u, true, 120)),
    );
    expect(f.collectedTotal).toBe(720);
    expect(f.pendingTotal).toBe(0);
    expect(f.budgetCovered).toBe(true);
    expect(f.budgetDelta).toBe(120);
  });

  it('reto gratuito: todos pagados y nada pendiente', () => {
    const f = computeFinance({ ...challenge, feePerParticipant: 0, budgetTotal: null }, [
      participant('u1', false, null),
    ]);
    expect(f.counts).toEqual({ paid: 1, partial: 0, unpaid: 0 });
    expect(f.expectedTotal).toBe(0);
    expect(f.pendingTotal).toBe(0);
    expect(f.budgetCovered).toBe(true);
  });

  it('fila histórica marcada pagada sin monto -> parcial con 0', () => {
    const f = computeFinance(challenge, [participant('u1', true, null)]);
    expect(f.participants[0].state).toBe('partial');
    expect(f.participants[0].amountPaid).toBe(0);
    expect(f.collectedTotal).toBe(0);
  });
});

describe('presupuesto automático o manual', () => {
  const auto = { ...challenge, budgetTotal: null };

  it('sin monto fijado es cuota × inscritos', () => {
    const f = computeFinance(auto, ['u1', 'u2', 'u3', 'u4', 'u5'].map((u) => participant(u, true, 120)));
    expect(f.budgetMode).toBe('auto');
    expect(f.budgetTotal).toBe(600);
    expect(f.budgetCovered).toBe(true);
    expect(f.budgetDelta).toBe(0);
  });

  it('el automático sigue a los inscritos y a la cuota', () => {
    expect(effectiveBudget(auto, 4)).toEqual({ budget: 480, mode: 'auto' });
    expect(effectiveBudget(auto, 5)).toEqual({ budget: 600, mode: 'auto' });
    expect(effectiveBudget({ ...auto, feePerParticipant: '150.00' }, 5)).toEqual({ budget: 750, mode: 'auto' });
  });

  it('un monto fijado a mano no cambia con los inscritos ni con la cuota', () => {
    const manual = { ...challenge, budgetTotal: '800.00' };
    expect(effectiveBudget(manual, 4)).toEqual({ budget: 800, mode: 'manual' });
    expect(effectiveBudget({ ...manual, feePerParticipant: 150 }, 9)).toEqual({ budget: 800, mode: 'manual' });
    // Un cero fijado a mano también es manual
    expect(effectiveBudget({ ...challenge, budgetTotal: 0 }, 5)).toEqual({ budget: 0, mode: 'manual' });
  });

  it('lo recaudado suma solo los pagos confirmados', () => {
    expect(collectedTotal([participant('u1', true, 120), participant('u2', true, '60.50'), participant('u3', false, 120)])).toBe(180.5);
  });
});

describe('computePayout', () => {
  it('un ganador se lleva el pote', () => {
    expect(computePayout('600.00', 1, 120)).toEqual({
      pot: 600,
      winnersCount: 1,
      perWinner: 600,
      monetary: true,
    });
  });

  it('dos ganadores reparten', () => {
    expect(computePayout(500, 2, 120).perWinner).toBe(250);
  });

  it('tres premiados', () => {
    expect(computePayout(600, 3, 120).perWinner).toBe(200);
  });

  it('reto sin cuota -> premio no monetario', () => {
    expect(computePayout(0, 2, 0)).toEqual({ pot: 0, winnersCount: 2, perWinner: 0, monetary: false });
  });

  it('reto con cuota y sin pagos todavía -> pote 0 pero monetario', () => {
    expect(computePayout(0, 1, '120.00')).toEqual({ pot: 0, winnersCount: 1, perWinner: 0, monetary: true });
  });

  it('sin ganadores -> perWinner 0', () => {
    expect(computePayout(600, 0, 120).perWinner).toBe(0);
  });

  it('el reparto nunca supera el pote (redondeo hacia abajo)', () => {
    const p = computePayout(100, 3, 50);
    expect(p.perWinner).toBe(33.33);
    expect(p.perWinner * 3).toBeLessThanOrEqual(100);
  });
});

describe('FinanceService.getFinance', () => {
  it('404 si el reto no existe', async () => {
    const prisma = {
      challenge: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    await expect(new FinanceService(prisma).getFinance('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('calcula a partir del reto y sus participantes', async () => {
    const prisma = {
      challenge: {
        findUnique: jest.fn().mockResolvedValue({
          ...challenge,
          participants: [participant('u1', true, 120), participant('u2', false, null)],
        }),
      },
    } as unknown as PrismaService;
    const f = await new FinanceService(prisma).getFinance('c1');
    expect(f.expectedTotal).toBe(240);
    expect(f.collectedTotal).toBe(120);
    expect(f.counts.unpaid).toBe(1);
  });
});
