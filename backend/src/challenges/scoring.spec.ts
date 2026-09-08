import { TiebreakRule } from '@prisma/client';

import {
  computeScore,
  describeScoring,
  isQualified,
  ScoringRules,
  selectWinners,
} from './scoring';

const defaults: ScoringRules = {
  pointsPerValidatedDay: 1,
  pointsPerKm: 0,
  minValidatedDaysToQualify: 0,
  maxWinners: 2,
  tiebreakRule: TiebreakRule.DRAW,
};

function candidate(id: string, totalKm: number) {
  return { id, totalKm };
}

describe('computeScore', () => {
  it('con los defaults el puntaje son los días validados', () => {
    expect(computeScore(defaults, { validatedDays: 6, totalKm: 30 })).toBe(6);
  });

  it('suma puntos por kilómetro cuando el reto lo configura', () => {
    const rules = { ...defaults, pointsPerValidatedDay: 10, pointsPerKm: 1 };
    expect(computeScore(rules, { validatedDays: 3, totalKm: 12.5 })).toBe(42.5);
  });

  it('acepta decimales de Prisma (string) y redondea a 2', () => {
    const rules = { ...defaults, pointsPerValidatedDay: 1, pointsPerKm: '0.33' };
    expect(computeScore(rules, { validatedDays: 2, totalKm: 10 })).toBe(5.3);
  });

  it('sin actividades validadas el puntaje es 0', () => {
    expect(computeScore(defaults, { validatedDays: 0, totalKm: 0 })).toBe(0);
  });
});

describe('isQualified', () => {
  it('con el default exige al menos un punto', () => {
    expect(isQualified(defaults, { validatedDays: 0, score: 0 })).toBe(false);
    expect(isQualified(defaults, { validatedDays: 1, score: 1 })).toBe(true);
  });

  it('respeta el mínimo de días validados', () => {
    const rules = { ...defaults, minValidatedDaysToQualify: 10 };
    expect(isQualified(rules, { validatedDays: 8, score: 8 })).toBe(false);
    expect(isQualified(rules, { validatedDays: 10, score: 10 })).toBe(true);
  });
});

describe('describeScoring', () => {
  it('no describe nada con la configuración por defecto', () => {
    expect(describeScoring(defaults)).toBeNull();
  });

  it('describe puntaje y mínimo cuando están configurados', () => {
    const text = describeScoring({
      ...defaults,
      pointsPerValidatedDay: 10,
      pointsPerKm: 1,
      minValidatedDaysToQualify: 8,
    });
    expect(text).toMatch(/10 por día validado/);
    expect(text).toMatch(/1 por km/);
    expect(text).toMatch(/8 días/);
  });
});

describe('selectWinners', () => {
  it('sin empatados no hay ganador', () => {
    const r = selectWinners([], defaults);
    expect(r.winners).toHaveLength(0);
    expect(r.drawNeeded).toBe(false);
  });

  it('un solo participante en el tope gana sin desempate', () => {
    const r = selectWinners([candidate('a', 10)], defaults);
    expect(r.winners.map((w) => w.id)).toEqual(['a']);
    expect(r.drawNeeded).toBe(false);
  });

  it('empate dentro del cupo: ganan todos sin sorteo', () => {
    const r = selectWinners([candidate('a', 10), candidate('b', 5)], defaults);
    expect(r.winners).toHaveLength(2);
    expect(r.drawNeeded).toBe(false);
  });

  it('DRAW con más empatados que cupos: sortea entre los empatados', () => {
    const tied = [candidate('a', 1), candidate('b', 2), candidate('c', 3), candidate('d', 4)];
    const r = selectWinners(tied, defaults);
    expect(r.winners).toHaveLength(2);
    expect(r.drawNeeded).toBe(true);
    expect(r.winners.every((w) => tied.some((t) => t.id === w.id))).toBe(true);
    expect(new Set(r.winners.map((w) => w.id)).size).toBe(2);
  });

  it('maxWinners = 1 devuelve un único ganador', () => {
    const r = selectWinners([candidate('a', 1), candidate('b', 2), candidate('c', 3)], {
      ...defaults,
      maxWinners: 1,
    });
    expect(r.winners).toHaveLength(1);
  });

  it('TOTAL_KM desempata por kilómetros sin sorteo', () => {
    const r = selectWinners(
      [candidate('a', 18), candidate('b', 30), candidate('c', 22)],
      { ...defaults, maxWinners: 1, tiebreakRule: TiebreakRule.TOTAL_KM },
    );
    expect(r.winners.map((w) => w.id)).toEqual(['b']);
    expect(r.drawNeeded).toBe(false);
  });

  it('TOTAL_KM con kilómetros también empatados en el corte: sortea entre esos', () => {
    const r = selectWinners([candidate('a', 20), candidate('b', 20)], {
      ...defaults,
      maxWinners: 1,
      tiebreakRule: TiebreakRule.TOTAL_KM,
    });
    expect(r.winners).toHaveLength(1);
    expect(r.drawNeeded).toBe(true);
  });

  it('TOTAL_KM combina cupos ya asegurados con sorteo en el corte', () => {
    const r = selectWinners(
      [candidate('a', 40), candidate('b', 20), candidate('c', 20)],
      { ...defaults, maxWinners: 2, tiebreakRule: TiebreakRule.TOTAL_KM },
    );
    expect(r.winners.map((w) => w.id)).toContain('a');
    expect(r.winners).toHaveLength(2);
    expect(r.drawNeeded).toBe(true);
  });

  it('SHARE_ALL: ganan todos los empatados aunque superen el cupo', () => {
    const tied = [1, 2, 3, 4, 5].map((i) => candidate(`p${i}`, i));
    const r = selectWinners(tied, { ...defaults, tiebreakRule: TiebreakRule.SHARE_ALL });
    expect(r.winners).toHaveLength(5);
    expect(r.drawNeeded).toBe(false);
  });
});
