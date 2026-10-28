import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateChallengeDto } from './create-challenge.dto';

const base = {
  month: 5,
  year: 2026,
  startDate: '2026-05-01',
  endDate: '2026-05-31',
  monthlyFee: 100,
  prizePoolAmount: 100,
  rules: {},
};

async function nameErrors(name: string) {
  const dto = plainToInstance(CreateChallengeDto, { ...base, name });
  const errors = await validate(dto);
  return errors.filter((e) => e.property === 'name').flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('CreateChallengeDto: longitud del nombre', () => {
  it('acepta 100 caracteres y rechaza 101 con mensaje en español', async () => {
    expect(await nameErrors('a'.repeat(100))).toEqual([]);
    expect(await nameErrors('a'.repeat(101))).toContain('El nombre no puede superar los 100 caracteres');
  });
});
