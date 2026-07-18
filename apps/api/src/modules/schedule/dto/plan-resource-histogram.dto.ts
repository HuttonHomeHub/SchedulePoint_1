import { ApiProperty } from '@nestjs/swagger';
import {
  HISTOGRAM_GRANULARITIES,
  type HistogramGranularity,
  type ResourceHistogramBucket,
  type ResourceHistogramSeries,
} from '@repo/types';

/**
 * One time bucket on the shared histogram axis (M7 rung 5, ADR-0044 §3). `start` inclusive, `end`
 * exclusive, both `YYYY-MM-DD`; every series' `values` aligns index-for-index to the bucket list.
 */
export class ResourceHistogramBucketDto implements ResourceHistogramBucket {
  @ApiProperty({ format: 'date', description: 'Inclusive bucket start (YYYY-MM-DD).' })
  start!: string;

  @ApiProperty({ format: 'date', description: 'Exclusive bucket end (= the next bucket’s start).' })
  end!: string;
}

/**
 * One resource's units-over-time series (M7 rung 5, ADR-0044 §3 / ADR-0035 §31): `values[i]` is the
 * curve-shaped `budgetedUnits` this resource is loaded with in bucket `i` (exact quantity), `total` its
 * whole distributed load (units are conserved: `Σ values === Σ its assignments' budgetedUnits`).
 */
export class ResourceHistogramSeriesDto implements ResourceHistogramSeries {
  @ApiProperty({ format: 'uuid', description: 'The loaded resource.' })
  resourceId!: string;

  @ApiProperty({
    type: [Number],
    description: 'Curve-shaped units per bucket, aligned to the shared bucket axis in meta.',
  })
  values!: number[];

  @ApiProperty({ description: 'The resource’s total distributed load (Σ values).' })
  total!: number;

  static from(series: ResourceHistogramSeries): ResourceHistogramSeriesDto {
    return { resourceId: series.resourceId, values: [...series.values], total: series.total };
  }
}

/**
 * The `meta` of the resource-histogram response (M7 rung 5, ADR-0044 §3). Carries the **shared bucket
 * axis** (so paging the series never splits it), the `granularity`, the total series count + page flags,
 * and `curveNormalisedCount` (N29 — assignments whose curve profile did not sum to 100 and were
 * normalised to conserve units).
 */
export class ResourceHistogramMetaDto {
  @ApiProperty({ enum: HISTOGRAM_GRANULARITIES, description: 'The time-bucket granularity.' })
  granularity!: HistogramGranularity;

  @ApiProperty({ type: [ResourceHistogramBucketDto], description: 'The shared time-bucket axis.' })
  buckets!: ResourceHistogramBucketDto[];

  @ApiProperty({ description: 'Total number of resource series (across all pages).' })
  total!: number;

  @ApiProperty({ description: 'Whether more series follow this page.' })
  hasMore!: boolean;

  @ApiProperty({
    description:
      'Assignments whose loading-curve profile did not sum to 100 and were normalised to conserve ' +
      'units (N29, ADR-0035 §31) — a read-time data-quality signal, never a reject.',
  })
  curveNormalisedCount!: number;
}
