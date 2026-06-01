import { IsString, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PaymentProofDto {
  @ApiProperty()
  @IsUrl({ require_tld: false })
  paymentProofUrl!: string;

  @ApiProperty()
  @IsString()
  paymentProofCloudinaryId!: string;
}
