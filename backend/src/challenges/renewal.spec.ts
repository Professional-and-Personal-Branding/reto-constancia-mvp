import { monthPeriod, nextMonth, renewableRules, suggestedName, MONTH_NAMES } from './renewal';

describe('renewal: nextMonth', () => {
  it('avanza al mes siguiente del mismo año', () => {
    expect(nextMonth(10, 2026)).toEqual({ month: 11, year: 2026 });
    expect(nextMonth(1, 2026)).toEqual({ month: 2, year: 2026 });
  });

  it('diciembre pasa a enero del año siguiente', () => {
    expect(nextMonth(12, 2026)).toEqual({ month: 1, year: 2027 });
  });
});

describe('renewal: monthPeriod', () => {
  const iso = (d: Date) => d.toISOString();

  it('cubre del primer al último día en meses de 30 y 31 días', () => {
    const nov = monthPeriod(11, 2026);
    expect(iso(nov.startDate)).toBe('2026-11-01T00:00:00.000Z');
    expect(iso(nov.endDate)).toBe('2026-11-30T00:00:00.000Z');
    const dec = monthPeriod(12, 2026);
    expect(iso(dec.endDate)).toBe('2026-12-31T00:00:00.000Z');
  });

  it('febrero tiene 28 días en 2027 y 29 en 2028', () => {
    expect(iso(monthPeriod(2, 2027).endDate)).toBe('2027-02-28T00:00:00.000Z');
    expect(iso(monthPeriod(2, 2028).endDate)).toBe('2028-02-29T00:00:00.000Z');
  });
});

describe('renewal: suggestedName', () => {
  it('usa el nombre del mes en español', () => {
    expect(suggestedName(11, 2026)).toBe('Reto Noviembre 2026');
    const names = Array.from({ length: 12 }, (_, i) => suggestedName(i + 1, 2027));
    expect(names).toEqual([
      'Reto Enero 2027',
      'Reto Febrero 2027',
      'Reto Marzo 2027',
      'Reto Abril 2027',
      'Reto Mayo 2027',
      'Reto Junio 2027',
      'Reto Julio 2027',
      'Reto Agosto 2027',
      'Reto Septiembre 2027',
      'Reto Octubre 2027',
      'Reto Noviembre 2027',
      'Reto Diciembre 2027',
    ]);
    expect(MONTH_NAMES).toHaveLength(12);
  });
});

describe('renewal: renewableRules', () => {
  const source = {
    id: 'c1',
    name: 'Reto Octubre 2026',
    month: 10,
    year: 2026,
    startDate: new Date('2026-10-01'),
    endDate: new Date('2026-10-31'),
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    participants: [],
    activities: [],
    validDays: [1, 2, 3],
    minHeartRateMinutes: 25,
    feePerParticipant: 150,
    budgetTotal: null,
    currency: 'USD',
    prizeDescription: 'Zapatillas',
    pointsPerValidatedDay: 2,
    pointsPerKm: 0.5,
    minValidatedDaysToQualify: 10,
    maxWinners: 3,
    tiebreakRule: 'TOTAL_KM',
  };

  it('devuelve exactamente las once reglas, sin identidad, estado, fechas ni relaciones', () => {
    const rules = renewableRules(source as never);
    expect(Object.keys(rules).sort()).toEqual(
      [
        'budgetTotal',
        'currency',
        'feePerParticipant',
        'maxWinners',
        'minHeartRateMinutes',
        'minValidatedDaysToQualify',
        'pointsPerKm',
        'pointsPerValidatedDay',
        'prizeDescription',
        'tiebreakRule',
        'validDays',
      ].sort(),
    );
    expect(rules).toEqual({
      validDays: [1, 2, 3],
      minHeartRateMinutes: 25,
      feePerParticipant: 150,
      budgetTotal: null,
      currency: 'USD',
      prizeDescription: 'Zapatillas',
      pointsPerValidatedDay: 2,
      pointsPerKm: 0.5,
      minValidatedDaysToQualify: 10,
      maxWinners: 3,
      tiebreakRule: 'TOTAL_KM',
    });
  });

  it('copia el arreglo de días sin compartir la referencia', () => {
    const rules = renewableRules(source as never);
    expect(rules.validDays).not.toBe(source.validDays);
  });
});
