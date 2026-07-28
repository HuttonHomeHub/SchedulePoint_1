import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/**
 * Query params for listing a plan's baselines.
 *
 * The only list in the app that honours `order`, so it is the only one that
 * declares it (TECH_DEBT #19). Baselines are a short, capture-ordered history a
 * planner reads in either direction — newest first to find the current picture,
 * oldest first to read the sequence — and `BaselineRepository.list` threads the
 * value straight into its `(created_at, id)` keyset, which is direction-agnostic
 * as long as both terms flip together.
 */
export class ListBaselinesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: ['asc', 'desc'],
    default: 'desc',
    description: 'Capture-time sort direction.',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'desc';
}
