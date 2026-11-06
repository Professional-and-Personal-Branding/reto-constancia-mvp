import * as argon2 from 'argon2';

import { hashPassword } from './password-hash';

const PARAMS = /^\$argon2id\$v=\d+\$m=\d+,t=\d+,p=\d+\$/;

describe('hashPassword', () => {
  it('produce un hash argon2id que argon2.verify acepta', async () => {
    const hash = await hashPassword('Secret123');
    expect(hash).toMatch(PARAMS);
    expect(await argon2.verify(hash, 'Secret123')).toBe(true);
    expect(await argon2.verify(hash, 'otra')).toBe(false);
  });
});
