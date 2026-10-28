import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { IsAccountPassword } from '../password-policy';

export class RegisterDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 2 })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({
    minLength: 8,
    description:
      'Mínimo 8 caracteres, con al menos una letra y un número (OWASP).',
  })
  @IsAccountPassword()
  password!: string;
}
