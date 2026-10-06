import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AwardChallengeDto } from './award-challenge.dto';

const USER = '11111111-1111-4111-8111-111111111111';

async function errorsFor(notes: string) {
  const dto = plainToInstance(AwardChallengeDto, { userIds: [USER], notes });
  return (await validate(dto)).flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('AwardChallengeDto: nota reservada', () => {
  it('rechaza la nota del sorteo automático, también con espacios alrededor', async () => {
    for (const notes of ['Sorteo automático al cierre', '  Sorteo automático al cierre ']) {
      expect(await errorsFor(notes)).toContain('Esa nota está reservada para el sorteo automático');
    }
  });

  it('acepta cualquier otra nota', async () => {
    expect(await errorsFor('Sorteo presencial ante el grupo')).toEqual([]);
  });
});
