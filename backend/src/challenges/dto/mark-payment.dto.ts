import { IsBoolean, IsNumber, IsOptional, IsString, IsUrl } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MarkPaymentDto {
  @ApiProperty()
  @IsBoolean()
  paid!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  amountPaid?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  paymentProofUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentProofCloudinaryId?: string;
}
