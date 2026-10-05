import { IsString, IsUrl, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PaymentProofDto {
  @ApiProperty()
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  @MaxLength(500)
  paymentProofUrl!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  paymentProofCloudinaryId!: string;
}
