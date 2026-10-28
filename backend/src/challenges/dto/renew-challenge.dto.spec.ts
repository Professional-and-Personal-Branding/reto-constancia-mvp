import { BadRequestException, ValidationPipe } from '@nestjs/common';

import { RenewChallengeDto } from './renew-challenge.dto';

// Misma configuración que main.ts: la conversión implícita es lo que volvía "false" en true.
const pipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});
const run = (value: unknown) =>
  pipe.transform(value, { type: 'body', metatype: RenewChallengeDto }) as Promise<RenewChallengeDto>;

describe('RenewChallengeDto: copyParticipants y nombre', () => {
  it('acepta booleanos reales y conserva su valor', async () => {
    expect((await run({ copyParticipants: false })).copyParticipants).toBe(false);
    expect((await run({ copyParticipants: true })).copyParticipants).toBe(true);
    expect((await run({})).copyParticipants).toBeUndefined();
  });

  it('rechaza con 400 un valor que no es booleano, incluido el texto "false"', async () => {
    for (const bad of ['false', 'true', 0, 1, 'si']) {
      await expect(run({ copyParticipants: bad })).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('el nombre admite 100 caracteres y rechaza 101', async () => {
    expect((await run({ name: 'a'.repeat(100) })).name).toHaveLength(100);
    await expect(run({ name: 'a'.repeat(101) })).rejects.toBeInstanceOf(BadRequestException);
  });
});
