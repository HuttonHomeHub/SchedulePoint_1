import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReferenceItemStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { UUID_REGEX } from '../../../common/validation/uuid';

/**
 * Query params for listing reference items within an organisation (scoped).
 *
 * Note `sort` and `order` are declared HERE, not inherited. The shared
 * `PaginationQueryDto` carries only `limit`/`cursor`: a list declares a sort
 * field or direction only if it threads that value into its own `orderBy`
 * (docs/API.md, TECH_DEBT #19). Advertising a param the service discards gives
 * the caller a `200` and the wrong page with nothing to signal it.
 */
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

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc', description: 'Sort direction.' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'desc';
}
