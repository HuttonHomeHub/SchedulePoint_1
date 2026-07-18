import { ApiPropertyOptional } from '@nestjs/swagger';
import { HISTOGRAM_GRANULARITIES, type HistogramGranularity } from '@repo/types';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Query params for the resource-histogram read (M7 rung 5, ADR-0044 §3 / ADR-0035 §31). `granularity`
 * sets the shared time-bucket period; `limit`/`offset` page over the **per-resource series** (the shared
 * bucket axis rides in `meta`, so paging never splits a resource's row). Offset-based because the series
 * are built in-memory from the pure read-model, not streamed from the DB.
 */
export class ResourceHistogramQueryDto {
  @ApiPropertyOptional({
    enum: HISTOGRAM_GRANULARITIES,
    default: 'DAY',
    description: 'Time-bucket granularity for the shared axis.',
  })
  @IsOptional()
  @IsIn(HISTOGRAM_GRANULARITIES)
  granularity: HistogramGranularity = 'DAY';

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 200,
    default: 50,
    description: 'Maximum number of resource series to return in this page.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 50;

  @ApiPropertyOptional({
    minimum: 0,
    default: 0,
    description: 'Number of resource series to skip (offset paging over the series list).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}
