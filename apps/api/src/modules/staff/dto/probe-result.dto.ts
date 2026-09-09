import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// Imported for their OpenAPI shape only — the read path does not construct or validate them. One
// declaration of each, so the request and the response cannot describe the same JSON differently.
import { ProbeCountsDto, ProbeThresholdsDto } from './create-probe-result.dto';

/**
 * One stored limb, read back.
 *
 * **The server does not judge** (spec D5). It stores `samples`, `counts` and `thresholds` and hands
 * them back; the verdict is derived on read by the one shared `judge()` in `apps/web`. That is what
 * keeps a single derivation of the rule — the CLI and the panel already share it — and it is why a
 * row that predates a change to a bar is still readable against the bar it was judged under.
 *
 * It is also why this DTO carries no `verdict` field, and why adding one later would be a
 * behavioural change rather than a convenience: a stored verdict is a second copy of a rule.
 */
export class ProbeResultRowDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    format: 'uuid',
    description:
      'Groups the limbs of ONE press. Minted server-side, so a client cannot file one machine’s ' +
      'numbers under another’s grouping.',
  })
  runId!: string;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description:
      'Groups several presses into one SITTING. NULL means this reading was a single press — ' +
      'true of every row written before the column existed and of every future single run. ' +
      'Client-supplied, unlike `runId`: only the client knows four presses were one sitting.',
  })
  sweepId!: string | null;

  @ApiProperty({
    nullable: true,
    description:
      'The frame budget ONE PHASE ran for. NULL means **not recorded** — it is inferable from ' +
      '`samples.length`, and inferring it would write a fact derived from a bundle version into ' +
      'a field readers will trust.',
  })
  framesPerPhase!: number | null;

  @ApiProperty({ format: 'date-time', description: 'Server-stamped. The retention predicate.' })
  recordedAt!: string;

  @ApiProperty({
    nullable: true,
    description:
      'The staff member’s address **as it was**, denormalised on purpose: the account may not ' +
      'exist when anyone reads this, and a rename must not rewrite a measurement’s provenance. ' +
      'NULL is the ADR-0085 erasure scrub, not a producer omitting it.',
  })
  // `@ApiProperty({ nullable: true })`, not `@ApiPropertyOptional` — `docs/TECH_DEBT.md` #259
  // item 1. The field is ALWAYS PRESENT and merely nullable, which is what its five siblings in
  // this DTO already say; the optional form made a generated client type it as possibly absent,
  // so a consumer had to handle a state the server never produces.
  recordedByLabel!: string | null;

  @ApiProperty()
  scenarioId!: string;

  @ApiProperty()
  scenarioVersion!: number;

  @ApiProperty()
  limbId!: string;

  @ApiProperty({ enum: ['difference', 'absolute'] })
  limbKind!: string;

  @ApiProperty()
  preset!: string;

  @ApiProperty()
  pxPerDay!: number;

  @ApiProperty({ description: 'What the scene CONTAINED — pair with `counts` to see the cull.' })
  activityCount!: number;

  @ApiProperty()
  edgeCount!: number;

  @ApiProperty()
  sceneSummary!: string;

  @ApiProperty({
    type: 'array',
    items: { type: 'object', additionalProperties: true },
    description:
      'One entry per pair (`difference`) or per repeat (`absolute`) — dispatch on `limbKind`. ' +
      'Aggregates, never raw per-frame intervals: those are ~2,400 numbers per pair and belong ' +
      'in a profiler this feature explicitly is not.',
  })
  samples!: unknown[];

  /**
   * **Named on the way out, as it is on the way in** (`docs/TECH_DEBT.md` #259 item 2).
   *
   * These two were declared as opaque objects while the request DTO fully named their fields one
   * file over, so a generated client got `Record<string, unknown>` for a shape the server had just
   * validated field by field. `samples` beside them is legitimately opaque — its members differ by
   * `limbKind` — and these are not.
   *
   * The **TypeScript** type stays `Record<string, unknown>` deliberately: this value is JSON read
   * back from the database and is not re-validated on read, so a narrower TS type would assert a
   * guarantee the read path does not make. The OpenAPI declaration is a claim about what every
   * writer produced, which is checkable — every row on this table was written through
   * `ProbeCountsDto`/`ProbeThresholdsDto`, and the DTO's bounds are a strict subset of the
   * database's CHECK constraints.
   */
  @ApiProperty({
    type: ProbeCountsDto,
    description: 'Non-vacuity numerators AND denominators, counted inside the viewport.',
  })
  counts!: Record<string, unknown>;

  @ApiProperty({
    type: ProbeThresholdsDto,
    description: 'The bars this limb was judged against, recorded WITH the measurement.',
  })
  thresholds!: Record<string, unknown>;

  @ApiProperty()
  viewportWidth!: number;

  @ApiProperty()
  viewportHeight!: number;

  @ApiProperty()
  devicePixelRatio!: number;

  @ApiProperty({
    description: 'The measured idle frame interval dropped frames were scored against.',
  })
  idleIntervalMs!: number;

  @ApiProperty({ nullable: true })
  hardwareConcurrency!: number | null;

  @ApiProperty({ nullable: true })
  deviceMemoryGb!: number | null;

  @ApiProperty({ nullable: true, description: 'NULL means masked or unavailable — never a guess.' })
  gpuRenderer!: string | null;

  @ApiProperty()
  userAgent!: string;

  @ApiProperty()
  reducedMotion!: boolean;

  @ApiProperty()
  lostFocusDuringRun!: boolean;

  @ApiProperty({ nullable: true })
  machineLabel!: string | null;

  @ApiProperty({ description: 'The web bundle that drew the frames.' })
  appVersion!: string;

  @ApiProperty({ description: 'The API release that stored them — stamped here, never posted.' })
  apiVersion!: string;
}

/**
 * The history read.
 *
 * **No cursor, and that is a bound rather than an omission.** This table has no automated producer:
 * a row exists only because a person pressed a button and the run was not refused. A page of 50 is
 * more history than the panel can usefully show at once, and the index that serves it
 * (`recorded_at, id`, read backwards) is the same one the retention sweep ranges over. If a
 * per-limb history ever outgrows one page, that is the trigger to add a cursor **and** a second
 * index, with `EXPLAIN (ANALYZE, BUFFERS)` numbers in the migration that adds it.
 */
export class ProbeResultsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
