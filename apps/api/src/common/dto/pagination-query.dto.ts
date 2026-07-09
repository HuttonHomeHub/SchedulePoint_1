import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Base query params for cursor-paginated, sortable list endpoints
 * (see docs/API.md). Feature list DTOs extend this to add filters and a typed
 * `sort` field.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20, description: 'Page size.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ description: 'Opaque cursor from a previous response.' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc', description: 'Sort direction.' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'desc';
}
