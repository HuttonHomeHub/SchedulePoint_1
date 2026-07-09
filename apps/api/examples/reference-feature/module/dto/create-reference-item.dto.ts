import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReferenceItemStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { UUID_REGEX } from '../../../common/validation/uuid';

/** Request body for creating a reference item. Validated by the global pipe. */
export class CreateReferenceItemDto {
  @ApiProperty({ format: 'uuid', description: 'Owning organisation (resource scope).' })
  @Matches(UUID_REGEX, { message: 'organizationId must be a UUID' })
  organizationId!: string;

  @ApiProperty({ minLength: 1, maxLength: 120, example: 'Reference item' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: ReferenceItemStatus, default: ReferenceItemStatus.DRAFT })
  @IsOptional()
  @IsEnum(ReferenceItemStatus)
  status?: ReferenceItemStatus;
}
