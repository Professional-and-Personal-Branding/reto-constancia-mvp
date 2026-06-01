import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export type UploadResourceType = 'image' | 'raw' | 'auto';

export class SignUploadDto {
  @ApiPropertyOptional({
    description: 'Subcarpeta dentro del folder principal de Cloudinary',
    example: 'reto-mayo-2026',
  })
  @IsOptional()
  @IsString()
  folder?: string;

  @ApiPropertyOptional({
    description: 'Tipo de recurso para Cloudinary',
    enum: ['image', 'raw', 'auto'],
    default: 'image',
  })
  @IsOptional()
  @IsIn(['image', 'raw', 'auto'])
  resourceType?: UploadResourceType;
}
