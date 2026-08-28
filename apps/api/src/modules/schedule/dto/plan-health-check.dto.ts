import { ApiProperty } from '@nestjs/swagger';
import type {
  HealthBaselineRef,
  HealthMeasured,
  HealthMetricId,
  HealthMetricResult,
  HealthNotAssessableReason,
  HealthOffender,
  HealthSummary,
  HealthThreshold,
  HealthThresholdKind,
  HealthVerdict,
  ScheduleHealthReport,
} from '@repo/types';
import {
  HEALTH_METRIC_IDS,
  HEALTH_NOT_ASSESSABLE_REASONS,
  HEALTH_THRESHOLD_KINDS,
  HEALTH_VERDICTS,
} from '@repo/types';

/**
 * The DCMA 14-point health report (health M1). **The response carries no cost, rate or budget
 * field at any depth** — G4 (`plan-health-check.g4.structural.spec.ts`) pins that by name, so the
 * report structurally cannot vary by `cost:read` and one URL produces one document (spec §3.2).
 *
 * Every `enum:` below is DERIVED from the `@repo/types` tuple that also derives the union type —
 * never a hand-copied array, which would compile fine while silently missing a member added later
 * (the `HEALTH_METRIC_IDS` rule, extended to the other three closed sets on an M5 api-review
 * finding).
 */

export class HealthThresholdDto implements HealthThreshold {
  @ApiProperty({
    enum: HEALTH_THRESHOLD_KINDS,
    description:
      'How the threshold judges its measurement. A closed set — a client needs no default case.',
  })
  kind!: HealthThresholdKind;

  @ApiProperty({
    description:
      'The number judged against — the only place it is stated; clients must never restate it.',
  })
  value!: number;
}

export class HealthMeasuredDto implements HealthMeasured {
  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'Offending-row count. Populated for count-shaped AND percent-shaped metrics alike; null ' +
      'only for the two ratio-shaped index metrics (13/14).',
  })
  count!: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description:
      'The denominator the count is judged over; null when the metric is not percent-shaped.',
  })
  denominator!: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: '1-dp percentage of count / denominator; null when not percent-shaped.',
  })
  percent!: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    description: '4-dp index ratio (CPLI / BEI); null elsewhere.',
  })
  ratio!: number | null;
}

export class HealthOffenderDto implements HealthOffender {
  @ApiProperty({ enum: ['ACTIVITY', 'RELATIONSHIP'] })
  kind!: 'ACTIVITY' | 'RELATIONSHIP';

  @ApiProperty({
    description: 'The offending row’s own id (activity id, or dependency id for a RELATIONSHIP).',
  })
  id!: string;

  @ApiProperty({ nullable: true, type: String })
  code!: string | null;

  @ApiProperty({ description: 'The activity’s name, or "pred → succ" for a relationship.' })
  name!: string;

  @ApiProperty({
    description: 'The one-line why — "no predecessor", "lead of −120 min (SS)", "float 61 d".',
  })
  note!: string;

  @ApiProperty({
    description:
      'The activity the jump-to-offender seam selects: the activity itself, or the successor for a relationship finding.',
  })
  activityId!: string;
}

export class HealthMetricResultDto implements HealthMetricResult {
  @ApiProperty({ enum: HEALTH_METRIC_IDS })
  id!: HealthMetricId;

  @ApiProperty({ description: '1-based DCMA ordinal; the metrics array is always sorted by it.' })
  ordinal!: number;

  @ApiProperty({ description: 'The metric’s display name, e.g. "Missing logic".' })
  name!: string;

  @ApiProperty({ enum: HEALTH_VERDICTS })
  verdict!: HealthVerdict;

  @ApiProperty({
    enum: HEALTH_NOT_ASSESSABLE_REASONS,
    nullable: true,
    description:
      'Non-null if and only if verdict is NOT_ASSESSABLE. Deliberately redundant with the verdict ' +
      '— defence in depth for the printed document, whose renderer prints the sentence this names ' +
      'and structurally cannot print one for a passing row.',
  })
  reason!: HealthNotAssessableReason | null;

  @ApiProperty({
    nullable: true,
    type: HealthMeasuredDto,
    description:
      'null when verdict is NOT_ASSESSABLE — never a zero-filled shape, which would be ' +
      'indistinguishable from a real (degenerate) measurement.',
  })
  measured!: HealthMeasured | null;

  @ApiProperty({
    nullable: true,
    type: HealthThresholdDto,
    description:
      'What the metric is judged against. Kept on a NOT_ASSESSABLE row where one exists (the ' +
      'reader is owed "this would have been judged against ≥ 0.95"); null on INFORMATIONAL rows ' +
      '(metric 10) and metric 12 — a threshold object on screen reads as a real threshold.',
  })
  threshold!: HealthThreshold | null;

  @ApiProperty({
    nullable: true,
    type: Object,
    description:
      'Per-metric extra facts — metric 1’s exclusion rule and counts, metric 9’s two sub-counts, ' +
      'metric 10’s narrowing note, metric 13’s target source. null when verdict is NOT_ASSESSABLE.',
  })
  detail!: Record<string, unknown> | null;

  @ApiProperty({ description: 'The TRUE total of offenders, never the capped list length.' })
  offenderCount!: number;

  @ApiProperty({ description: 'True when offenders was truncated to the report’s offenderCap.' })
  offendersTruncated!: boolean;

  @ApiProperty({
    type: [HealthOffenderDto],
    description: 'At most offenderCap rows; empty on PASS and NOT_ASSESSABLE.',
  })
  offenders!: HealthOffender[];

  /** The M6 what-if route returns one bare metric row; same shape as the report carries. */
  static from(result: HealthMetricResult): HealthMetricResultDto {
    return Object.assign(new HealthMetricResultDto(), result);
  }
}

export class HealthBaselineRefDto implements HealthBaselineRef {
  @ApiProperty({ description: 'The active baseline’s id.' })
  id!: string;

  @ApiProperty({ description: 'The active baseline’s name, as printed on the report header.' })
  name!: string;

  @ApiProperty({ description: 'ISO instant the active baseline was captured.' })
  capturedAt!: string;
}

export class HealthSummaryDto implements HealthSummary {
  @ApiProperty()
  passed!: number;

  @ApiProperty()
  failed!: number;

  @ApiProperty()
  notAssessable!: number;

  @ApiProperty()
  informational!: number;
}

export class ScheduleHealthReportDto implements ScheduleHealthReport {
  @ApiProperty()
  planId!: string;

  @ApiProperty()
  planName!: string;

  @ApiProperty({ description: 'The data date (plans.planned_start), YYYY-MM-DD.' })
  dataDate!: string;

  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'When the persisted schedule was computed; null = never calculated, and the metrics that ' +
      'read engine output then report PLAN_NOT_SCHEDULED rather than a vacuous pass.',
  })
  computedAt!: string | null;

  @ApiProperty({ enum: ['EARLY', 'VISUAL'] })
  schedulingMode!: 'EARLY' | 'VISUAL';

  @ApiProperty({
    description: 'Active non-summary activities — the denominator convention, made visible.',
  })
  activityCount!: number;

  @ApiProperty({
    description: 'Dependencies between active activities — metrics 2–4’s denominator.',
  })
  relationshipCount!: number;

  @ApiProperty({ nullable: true, type: HealthBaselineRefDto })
  baseline!: HealthBaselineRef | null;

  @ApiProperty({ type: HealthSummaryDto })
  summary!: HealthSummary;

  @ApiProperty({
    description:
      'Offenders listed per metric before truncation. In the payload for the same reason the ' +
      'thresholds are: a client hard-coding 50 to render "showing 50 of 412" is a second source ' +
      'for a number the server owns.',
  })
  offenderCap!: number;

  @ApiProperty({
    type: [HealthMetricResultDto],
    description:
      'Always exactly 14 entries, one per HealthMetricId, in ordinal order — never sparse. A ' +
      'metric that could not be computed is present with verdict NOT_ASSESSABLE and a reason; it ' +
      'is never omitted.',
  })
  metrics!: HealthMetricResult[];

  static from(report: ScheduleHealthReport): ScheduleHealthReportDto {
    return Object.assign(new ScheduleHealthReportDto(), report);
  }
}
