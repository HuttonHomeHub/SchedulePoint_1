import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LIVE_REVISION, REVISION_INCLUDES, type RevisionInclude } from '@repo/types';
import { Transform } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsUUID, Matches } from 'class-validator';

import { toArray } from '../../../common/dto/to-array';
import { UUID_REGEX } from '../../../common/validation/uuid';

/**
 * Query params for the CROSS-PLAN revision comparison.
 *
 * A separate DTO rather than a widened `RevisionCompareQueryDto`: widening the shipped one would
 * make its `:planId` path segment a lie for one of the two sides, and would change a shipped
 * contract for every existing consumer to spare one class.
 *
 * The two revision params are the SAME "UUID or the literal `live`" idiom the shipped DTO uses —
 * the canonical `UUID_REGEX` unwrapped of its anchors, never a hand-rolled character class. That
 * matters because these ids are **v7**, and the hand-rolled version this repository shipped once
 * checked no version or variant nibble at all.
 */
const UUID_PATTERN = UUID_REGEX.source.replace(/^\^/, '').replace(/\$$/, '');
const REVISION_MATCHER = new RegExp(`^(${LIVE_REVISION}|${UUID_PATTERN})$`, 'i');

export class CrossPlanRevisionCompareQueryDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'The OLD side’s plan. Required — there is no sensible default for "the other plan", and ' +
      'guessing one would make the answer depend on something the caller did not name.',
  })
  @IsUUID()
  fromPlanId!: string;

  @ApiProperty({
    format: 'uuid',
    description:
      'The NEW side’s plan, and **the anchor**: every activity id in the response resolves in ' +
      'THIS plan, and `existsLive` reads as "present in the plan you are looking at". A row that ' +
      'exists only in the other plan carries a null `activityId`.',
  })
  @IsUUID()
  toPlanId!: string;

  @ApiPropertyOptional({
    default: LIVE_REVISION,
    description:
      'The OLD side: a baseline **of `fromPlanId`**, or the literal `live` for that plan as it ' +
      'stands now. A baseline of the OTHER plan named here is a 404, not a quiet comparison of ' +
      'unrelated snapshots.',
  })
  @Matches(REVISION_MATCHER, { message: 'from must be a baseline id or the literal "live".' })
  from: string = LIVE_REVISION;

  @ApiPropertyOptional({
    default: LIVE_REVISION,
    description: 'The NEW side: a baseline **of `toPlanId`**, or the literal `live`.',
  })
  @Matches(REVISION_MATCHER, { message: 'to must be a baseline id or the literal "live".' })
  to: string = LIVE_REVISION;

  @ApiPropertyOptional({
    enum: REVISION_INCLUDES,
    isArray: true,
    description:
      'Opt-in projections, the same vocabulary the plan-nested route accepts. Absent ⇒ the delta ' +
      'and the correlation only. `changes` adds the change list; `progress` additionally assesses ' +
      'the progress class, off by default because it moves on nearly every activity every week; ' +
      '`ghosts` adds the CROSS-PLAN ghost projection and the changed logic, which only a canvas ' +
      'needs. **Repeat the parameter to ask for more than one** — `?include=changes&include=ghosts`. ' +
      'A comma-joined value (`?include=changes,ghosts`) is rejected with 422: it is read as one ' +
      'value, and that value is not in the vocabulary.',
  })
  @IsOptional()
  // `?include=ghosts` arrives as a STRING, not a one-element array. Without this the single
  // include — which is exactly what a client sends — fails `@IsArray()` and the whole route
  // answers 400. It shipped that way on the sibling route for one commit and NO unit or API test
  // could see it; the journey caught it on its first run. `toArray` is the shared helper six other
  // query DTOs use: a second normaliser beside them is the drift this repository keeps recording.
  @Transform(({ value }: { value: unknown }) => toArray(value))
  @IsArray()
  @IsIn(REVISION_INCLUDES, { each: true })
  include?: RevisionInclude[];
}
