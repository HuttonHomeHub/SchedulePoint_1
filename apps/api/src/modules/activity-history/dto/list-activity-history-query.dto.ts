import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/**
 * Query of the history read. The base DTO's page size defaults to 20; a history is read a screen at a
 * time, so this one defaults to 50 (spec §2) and keeps the base's maximum of 100.
 */
export class ListActivityHistoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50, description: 'Page size.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  override limit = 50;
}
