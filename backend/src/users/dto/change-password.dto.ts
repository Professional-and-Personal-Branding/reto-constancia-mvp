import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { IsAccountPassword } from '../../auth/password-policy';

export class ChangePasswordDto {
  @ApiProperty({ maxLength: 256 })
  @IsString()
  @IsNotEmpty({ message: 'Escribe tu contraseña actual' })
  @MaxLength(256)
  currentPassword!: string;

  @ApiProperty({
    minLength: 8,
    maxLength: 72,
    description: 'Misma regla que el registro: 8 a 72 caracteres, con al menos una letra y un número.',
  })
  @IsAccountPassword()
  newPassword!: string;
}
