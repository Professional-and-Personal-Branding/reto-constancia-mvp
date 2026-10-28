import { validate } from 'class-validator';

import { IsAccountPassword } from './password-policy';

class Sample {
  @IsAccountPassword()
  password!: string;
}

async function messages(password: unknown): Promise<string[]> {
  const sample = new Sample();
  (sample as unknown as { password: unknown }).password = password;
  const errors = await validate(sample);
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('IsAccountPassword (regla única de contraseña)', () => {
  it('"soloLetras" falla por no tener un número', async () => {
    expect(await messages('soloLetras')).toContain('La contraseña debe incluir al menos una letra y un número');
  });

  it('"corta1" falla por tener menos de 8 caracteres', async () => {
    expect(await messages('corta1')).toContain('La contraseña debe tener al menos 8 caracteres');
  });

  it('"12345678" falla por no tener una letra', async () => {
    expect(await messages('12345678')).toContain('La contraseña debe incluir al menos una letra y un número');
  });

  it('una contraseña de 73 caracteres falla por superar el máximo', async () => {
    expect(await messages('a1'.repeat(36) + 'b')).toContain('La contraseña no puede superar 72 caracteres');
  });

  it('"Passw0rd1" y una de 72 caracteres pasan', async () => {
    expect(await messages('Passw0rd1')).toEqual([]);
    expect(await messages('a1'.repeat(36))).toEqual([]);
  });
});
