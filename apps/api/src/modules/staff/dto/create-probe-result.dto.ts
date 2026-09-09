import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

/**
 * The staff console's **first write** (ADR-0086 D6 claims one already exists; it does not).
 *
 * This body is **attacker-influenced** — a compromised staff session can post anything — so every
 * field is a refusal rather than a coercion, and the global pipe is configured
 * `whitelist` + `forbidNonWhitelisted` + `errorHttpStatusCode: 422`
 * (`app.module.ts:142-147`), so an undeclared field is a 422 rather than a silent drop.
 *
 * **Three fields are deliberately absent, and their absence is a service-layer obligation the
 * database cannot hold** (`m4-schema-record.md`, "Adopted in full"): `runId`, `recordedAt` and
 * `apiVersion` are server-set. A client-minted `runId` would let one machine's numbers be filed
 * under another's grouping; a client clock is neither trustworthy nor monotonic against this
 * database's, and it is the retention predicate; and an API version supplied by the browser is a
 * claim about a process the browser cannot observe — the web app reads it through a query cached
 * once per session, so a tab open across a deploy would report the previous release.
 *
 * **The POST body is never logged** (obligation 3). A Pino line carrying this DTO is a second copy
 * of a named staff member's GPU string and user agent, with different retention from the 365-day
 * bound the table itself carries.
 */

/** One measured window. The shape the bench already returns (`model/judge.ts` `PhaseTiming`). */
export class ProbePhaseTimingDto {
  @ApiProperty({ description: 'Frames that missed a display interval, as a percentage.' })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(100)
  droppedPct!: number;

  @ApiProperty({ description: 'Median frame interval, ms.' })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(10_000)
  intervalP50!: number;

  @ApiProperty({ description: '95th-percentile frame interval, ms.' })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(10_000)
  intervalP95!: number;

  @ApiProperty({ description: 'Frames per second over the measured window.' })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(1000)
  fps!: number;
}

/** One baseline/treatment pair, run back to back so both share their machine's mood. */
export class ProbePairDto {
  @ApiProperty({ type: ProbePhaseTimingDto })
  @ValidateNested()
  @Type(() => ProbePhaseTimingDto)
  baseline!: ProbePhaseTimingDto;

  @ApiProperty({ type: ProbePhaseTimingDto })
  @ValidateNested()
  @Type(() => ProbePhaseTimingDto)
  treatment!: ProbePhaseTimingDto;
}

/**
 * The non-vacuity numerators **and denominators**, counted inside the viewport.
 *
 * Both halves, because a numerator alone cannot distinguish "few bars drawn" from "few bars to
 * draw" — ADR-0066's cull defect stated as a column, where a plan laid nose to tail culled nine
 * bars in ten and the resulting 4.6 ms p95 looked exactly like the budget being met.
 */
export class ProbeCountsDto {
  @ApiProperty({ description: 'Bars the painter actually drew, from `cull`.' })
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  visibleBars!: number;

  @ApiPropertyOptional({ description: 'Links inside the viewport. Absent for a draw-only limb.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  visibleLinks?: number;

  @ApiPropertyOptional({ description: 'Of `visibleBars`, how many the treatment changed.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  visibleChangedBars?: number;

  @ApiPropertyOptional({ description: 'Of `visibleLinks`, how many the treatment changed.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  visibleChangedLinks?: number;
}

/**
 * The bars this limb was judged against, stored **with** the measurement.
 *
 * This is what makes changing a bar not re-interpret history — and it is why the server can store a
 * row it does not judge (D5): a reader with the row alone has everything the judge needs.
 */
export class ProbeThresholdsDto {
  @ApiProperty({ description: 'P2 — the absolute frames-per-second floor at this scale.' })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(1)
  @Max(1000)
  minFps!: number;

  @ApiProperty({
    description:
      'Whether a verdict was gated at all. False at the Fit framing, where the shipped painter ' +
      'already judders (`docs/TECH_DEBT.md` #75) and a gate would fail on day one.',
  })
  @IsBoolean()
  gated!: boolean;

  @ApiProperty({
    description: 'Where the floor comes from, so a reader can check it.',
    maxLength: 200,
  })
  @IsString()
  @MaxLength(200)
  source!: string;

  @ApiPropertyOptional({ description: 'P1 — the difference bar, in percentage points.' })
  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0)
  @Max(100)
  barPp?: number;

  @ApiPropertyOptional({ description: 'The non-vacuity floor this limb was checked against.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  minVisibleBars?: number;
}

/**
 * "Exactly one sample array, and it is the one `limbKind` says."
 *
 * `@ValidateIf` alone cannot express this: it SKIPS a property rather than refusing it, so a
 * `runs` array posted on a `difference` limb would pass validation and then be dropped on the
 * floor — a row stored with no samples at all, which the database's own non-empty CHECK would then
 * refuse as a 500 rather than the 422 it is.
 */
@ValidatorConstraint({ name: 'samplesMatchLimbKind', async: false })
export class SamplesMatchLimbKind implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const limb = args.object as ProbeLimbDto;
    const hasPairs = Array.isArray(limb.pairs);
    const hasRuns = Array.isArray(limb.runs);
    if (hasPairs === hasRuns) return false;
    return limb.limbKind === 'difference' ? hasPairs : hasRuns;
  }

  defaultMessage(): string {
    return 'a difference limb carries `pairs` and only `pairs`; an absolute limb carries `runs` and only `runs`';
  }
}

/** One limb of one run — and one row in `perf_probe_results` (`m4-schema-record.md` D-a). */
export class ProbeLimbDto {
  @ApiProperty({
    description:
      'The limb’s registry id (`scale-500`). Shape-checked, never value-checked — see ' +
      '`scenarioId`.',
    maxLength: 64,
  })
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/)
  limbId!: string;

  @ApiProperty({
    enum: ['difference', 'absolute'],
    description:
      'How `samples` is shaped. **The one value list on this body**, and the discriminator is ' +
      'principled: a reader dispatches on it to interpret the numbers, so a value the reader does ' +
      'not know is unreadable whatever anything else permits.',
  })
  @IsIn(['difference', 'absolute'])
  limbKind!: 'difference' | 'absolute';

  @ApiProperty({ description: 'The px/day the preset resolved to on this operator’s viewport.' })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0.000_001)
  @Max(100_000)
  pxPerDay!: number;

  @ApiProperty({ description: 'Activities the scene contained — not how many were drawn.' })
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  activityCount!: number;

  @ApiProperty({ description: 'Edges the scene contained — not how many were drawn.' })
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  edgeCount!: number;

  @ApiProperty({
    description: 'A one-liner for the history table. A label, never parsed.',
    maxLength: 200,
  })
  @IsString()
  @MaxLength(200)
  sceneSummary!: string;

  @ApiProperty({ type: ProbeCountsDto })
  @ValidateNested()
  @Type(() => ProbeCountsDto)
  counts!: ProbeCountsDto;

  @ApiProperty({ type: ProbeThresholdsDto })
  @ValidateNested()
  @Type(() => ProbeThresholdsDto)
  thresholds!: ProbeThresholdsDto;

  @ApiPropertyOptional({ type: [ProbePairDto], description: 'Required for a `difference` limb.' })
  @ValidateIf((limb: ProbeLimbDto) => limb.pairs !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ProbePairDto)
  pairs?: ProbePairDto[];

  @ApiPropertyOptional({
    type: [ProbePhaseTimingDto],
    description: 'Required for an `absolute` limb — one entry per repeat.',
  })
  @ValidateIf((limb: ProbeLimbDto) => limb.runs !== undefined)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ProbePhaseTimingDto)
  runs?: ProbePhaseTimingDto[];

  // Hung off `limbKind` so the message names the field a reader would look at first.
  @Validate(SamplesMatchLimbKind)
  readonly samplesShape?: never;
}

/** One press of **Run**: the machine it ran on, and one entry per limb. */
export class CreateProbeResultDto {
  @ApiProperty({
    description:
      'The scenario’s registry id. **Shape-checked and deliberately NOT value-checked**: ' +
      '`apps/web` and `apps/api` release as separate images (ADR-0027) pulled independently ' +
      '(ADR-0047), so an enum here would 422 a measurement taken by a newer web bundle for the ' +
      'whole skew window — losing the reading on the one machine that can produce one. The closed ' +
      'vocabulary lives in the web bundle that authors it (`features/perf-probe/model/scenarios.ts`), ' +
      'and an id this server does not recognise still stores and still reads back: the row carries ' +
      'its own thresholds, so it is judgeable without the registry.',
    maxLength: 64,
  })
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/)
  scenarioId!: string;

  @ApiProperty({
    description:
      'Bumped when the scenario’s scene or protocol changes, so a reader knows two rows ' +
      'measured the same thing.',
    minimum: 1,
    maximum: 9999,
  })
  @IsInt()
  @Min(1)
  @Max(9999)
  scenarioVersion!: number;

  @ApiProperty({
    description: 'The zoom preset the pan ran at. A label — shape-checked only.',
    maxLength: 32,
  })
  @IsString()
  @MaxLength(32)
  @Matches(/^[a-z][a-z0-9-]*$/)
  preset!: string;

  @ApiPropertyOptional({
    nullable: true,
    format: 'uuid',
    description:
      'Groups several presses into one SITTING. NULL means this reading was a single press — ' +
      'true of every row written before this column existed and of every future single run. ' +
      '**Client-supplied, unlike `runId`**, because only the client knows that four presses were ' +
      'one sitting: the server holds no state across them and cannot observe it. What that grants ' +
      '(grouping rows the operator did not group) is strictly weaker than fabricating the numbers, ' +
      'which a compromised staff session can already do.',
  })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  // **`@IsUUID()` is not optional here.** The column is `@db.Uuid`, so a malformed value that got
  // past validation would reach Postgres and raise an error the route does not map — a 500 that
  // loses the whole press. The DTO refuses first; the database is the backstop. No version
  // argument: the column accepts any, and pinning '4' would refuse a future v7 mint for nothing.
  @IsUUID()
  sweepId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    minimum: 1,
    maximum: 100_000,
    description:
      'The frame budget ONE PHASE ran for — the other half of the protocol `samples` carries ' +
      '(that array’s length is the repeats; this is the frames per repeat). NULL means **not ' +
      'recorded**: it is inferable from `samples.length` via a client-side constant, and ' +
      'inferring it would write a fact derived from a bundle version into a column readers will ' +
      'trust. A NULL on a row recorded after 2026-09-09 is a producer bug, not a historic gap.',
  })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsInt()
  @Min(1)
  // **The ceiling is required rather than decorative, and this is the one comment to read if it is
  // ever loosened.** The column is `int4`, and `@IsInt()` passes `1e12` — `Number.isInteger(1e12)`
  // is `true` — so without a `@Max` that value reaches Postgres, raises an out-of-range error the
  // route does not map, and returns a 500 that loses the press. The database's own bound is sign
  // only, deliberately: a range is a protocol, and a protocol in a CHECK means the day the product
  // widens it the database silently refuses rows the product decided to accept. So the DTO holds
  // the range and must stay a STRICT SUBSET of the CHECK — 100_000 is about 28 minutes of phase at
  // 60 Hz, far past any protocol a person waits for and comfortably inside int4.
  @Max(100_000)
  framesPerPhase?: number | null;

  @ApiProperty({ minimum: 200, maximum: 10_000 })
  @IsInt()
  @Min(200)
  @Max(10_000)
  viewportWidth!: number;

  @ApiProperty({ minimum: 200, maximum: 10_000 })
  @IsInt()
  @Min(200)
  @Max(10_000)
  viewportHeight!: number;

  @ApiProperty({ minimum: 0.1, maximum: 8 })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0.1)
  @Max(8)
  devicePixelRatio!: number;

  @ApiProperty({
    description:
      'The MEASURED idle frame interval — what dropped frames were scored against. Bounded here ' +
      'rather than in the database on purpose: a plausible-clock window is a policy, and encoding ' +
      'a policy as a CHECK means the day the product widens it the database silently refuses rows ' +
      'the product decided to accept.',
    minimum: 1,
    maximum: 200,
  })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(1)
  @Max(200)
  idleIntervalMs!: number;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'NULL means **not captured**, never a default and never guessed (the ADR-0126 rule).',
  })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(4096)
  hardwareConcurrency?: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'Chromium-only. NULL means not captured.' })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0.001)
  @Max(1024)
  deviceMemoryGb?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    maxLength: 256,
    description:
      'The unmasked WebGL renderer. **NULL means masked or unavailable, and is never a guess** — ' +
      'writing "unknown GPU" would put a fiction in the one field a reader trusts to explain an ' +
      'outlier.',
  })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  @MaxLength(256)
  gpuRenderer?: string | null;

  @ApiProperty({ maxLength: 512 })
  @IsString()
  @MaxLength(512)
  userAgent!: string;

  @ApiProperty({ description: '`prefers-reduced-motion` at run time.' })
  @IsBoolean()
  reducedMotion!: boolean;

  @ApiProperty({
    description:
      'The window lost focus during the run. **A flag, not a refusal**: a visible-but-unfocused ' +
      'window still composites, and refusing on it would make the instrument unusable on a ' +
      'two-monitor desk.',
  })
  @IsBoolean()
  lostFocusDuringRun!: boolean;

  @ApiPropertyOptional({
    nullable: true,
    maxLength: 200,
    description:
      'The operator’s own note ("the Dell, docked, on mains"). Absent means not typed, which ' +
      'is distinct from an empty string — that would claim they typed nothing. **Insert-time only ' +
      'in v1**: an edit route needs `updated_at` and `version`, which is a migration and a decision.',
  })
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsString()
  @MaxLength(200)
  machineLabel?: string | null;

  @ApiProperty({
    description:
      'The web bundle’s version — **posted**, because only the client knows which bundle drew ' +
      'the frames. Release granularity, not commit: ADR-0088 D1 established that ' +
      '`docker-publish.yml` passes no build args, so no SHA reaches either artefact.',
    maxLength: 64,
  })
  @IsString()
  @MaxLength(64)
  // **One optional group, one bounded quantifier, and no nesting — because the obvious semver
  // shape is a ReDoS.** The first version of this was
  // `(?:[-+][0-9A-Za-z.-]+)*`, where the group opens on `[-+]` and the inner class also contains
  // `-`, so a run of dashes can be split between the two in exponentially many ways. Measured on
  // this machine against `1.0.0-` + N dashes + `!`: 2.7 ms at 26, 2,260 ms at 40, and **281,307 ms
  // at 50**. CodeQL flagged it high on the pull request; `@MaxLength(64)` is no protection, because
  // class-validator evaluates every constraint rather than short-circuiting on the first failure —
  // and a compromised staff session posts this field directly.
  //
  // The replacement admits the same versions (`1.2.3`, `1.2.3-rc.1`, `1.2.3+build.5`,
  // `1.2.3-rc.1+build.5`) and refuses the same non-versions (`main`, `1.2`), at 0.003–0.007 ms for
  // every input length up to the column bound. It is deliberately NOT the official semver regex:
  // this field's job is to refuse a commit SHA or a branch name, not to adjudicate semver.
  @Matches(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]{0,56})?$/)
  appVersion!: string;

  @ApiProperty({
    type: [ProbeLimbDto],
    description: 'One entry per limb, in the scenario’s order.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ProbeLimbDto)
  limbs!: ProbeLimbDto[];
}
