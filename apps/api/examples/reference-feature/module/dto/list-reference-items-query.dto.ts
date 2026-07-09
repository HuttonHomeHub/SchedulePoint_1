import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReferenceItemStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { UUID_REGEX } from '../../../common/validation/uuid';

/** Query params for listing reference items within an organisation (scoped). */
export class ListReferenceItemsQueryDto extends PaginationQueryDto {
  @ApiProperty({ format: 'uuid', description: 'Organisation to list within (resource scope).' })
  @Matches(UUID_REGEX, { message: 'organizationId must be a UUID' })
  organizationId!: string;

  @ApiPropertyOptional({ enum: ReferenceItemStatus, description: 'Filter by status.' })
  @IsOptional()
  @IsEnum(ReferenceItemStatus)
  status?: ReferenceItemStatus;

  @ApiPropertyOptional({ description: 'Case-insensitive name search.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: ['createdAt', 'name'], default: 'createdAt' })
  @IsOptional()
  @IsIn(['createdAt', 'name'])
  sort: 'createdAt' | 'name' = 'createdAt';
}
