import { ApiProperty } from '@nestjs/swagger';
import type { InterchangeReport, ReportFinding, ReportFindingKind } from '@repo/interchange';

/**
 * One line in the interchange report: a value that was approximated, a structural repair, or an
 * out-of-scope drop. Mirrors `@repo/interchange`'s `ReportFinding` for OpenAPI. Nothing sensitive —
 * the report is a transparent statement of what did and did not come across (ADR-0050 / ADR-0035).
 */
export class ReportFindingResponseDto {
  @ApiProperty({
    enum: ['approximation', 'repair', 'drop'],
    description: 'The class of finding.',
  })
  kind!: ReportFindingKind;

  @ApiProperty({
    description: 'The affected entity kind, e.g. "activity", "relationship", "calendar".',
  })
  entity!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Source-local id/code of the affected item; null when not attributable to one.',
  })
  sourceRef!: string | null;

  @ApiProperty({ description: 'Human-readable summary of the finding.' })
  detail!: string;

  @ApiProperty({
    required: false,
    description: 'Why the finding occurred (the mapping-contract reason).',
  })
  reason?: string;
}

/** Counts of successfully mapped entities (M1 network scope). Extended additively per milestone. */
export class InterchangeCountsResponseDto {
  @ApiProperty({ description: 'Activities mapped.' })
  activities!: number;

  @ApiProperty({ description: 'Relationships (dependencies) mapped.' })
  relationships!: number;

  @ApiProperty({ description: 'Calendars mapped.' })
  calendars!: number;
}

/**
 * The pre-commit interchange report returned by the dry-run: detected format/version, mapped counts,
 * and the approximation / repair / drop findings. This is the runtime instance of ADR-0050's mapping
 * contract; it is produced by the pure `@repo/interchange` pipeline and carries no server internals.
 */
export class InterchangeReportResponseDto {
  @ApiProperty({ description: 'The format detected by content signature (XER for M1).' })
  detectedFormat!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The source schema/tool version if detectable (XER ERMHDR); null otherwise.',
  })
  sourceVersion!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Original upload filename (display only); null when not supplied.',
  })
  sourceFilename!: string | null;

  @ApiProperty({ type: InterchangeCountsResponseDto })
  mapped!: InterchangeCountsResponseDto;

  @ApiProperty({ type: ReportFindingResponseDto, isArray: true })
  approximations!: ReportFindingResponseDto[];

  @ApiProperty({ type: ReportFindingResponseDto, isArray: true })
  repairs!: ReportFindingResponseDto[];

  @ApiProperty({ type: ReportFindingResponseDto, isArray: true })
  drops!: ReportFindingResponseDto[];

  /** Map a pure-pipeline report to its API representation (the shapes are identical; this documents it). */
  static from(report: InterchangeReport): InterchangeReportResponseDto {
    return {
      detectedFormat: report.detectedFormat,
      sourceVersion: report.sourceVersion,
      sourceFilename: report.sourceFilename,
      mapped: {
        activities: report.mapped.activities,
        relationships: report.mapped.relationships,
        calendars: report.mapped.calendars,
      },
      approximations: report.approximations.map(toFinding),
      repairs: report.repairs.map(toFinding),
      drops: report.drops.map(toFinding),
    };
  }
}

/** Map one pure `ReportFinding` to its response shape, dropping `reason` when absent (exact-optional). */
function toFinding(finding: ReportFinding): ReportFindingResponseDto {
  return {
    kind: finding.kind,
    entity: finding.entity,
    sourceRef: finding.sourceRef,
    detail: finding.detail,
    ...(finding.reason === undefined ? {} : { reason: finding.reason }),
  };
}
