import { ApiProperty } from '@nestjs/swagger';
import { ConstraintType } from '@prisma/client';
import type {
  LevellingApplication,
  LevellingApplicationItem,
  LevellingApplicationNamedActivity,
  LevellingApplicationRow,
} from '@repo/types';

/**
 * One row to write, in exactly the shape `PATCH …/activities/placements` takes — so the client sends
 * `rows` as the `placements` array. The constraint is the stored one, round-tripped: a row is a complete
 * placement and the batch would otherwise clear it.
 */
export class LevellingApplicationRowDto implements LevellingApplicationRow {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    minimum: 1,
    description: 'The activity’s optimistic-locking version as read now.',
  })
  version!: number;

  @ApiProperty({ enum: ConstraintType, nullable: true })
  constraintType!: ConstraintType | null;

  @ApiProperty({ format: 'date', nullable: true, example: '2026-05-01' })
  constraintDate!: string | null;

  @ApiProperty({
    format: 'date',
    example: '2026-05-01',
    description:
      'The day to place the bar’s start on: the earliest WORKING day on the activity’s own calendar ' +
      'whose start is at or after the moment the resource frees up.',
  })
  visualStart!: string;

  @ApiProperty({
    nullable: true,
    type: Number,
    example: null,
    description: 'Always null: the lane is left alone.',
  })
  laneIndex!: null;
}

export class LevellingApplicationItemDto implements LevellingApplicationItem {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  code!: string | null;

  @ApiProperty({
    format: 'date',
    nullable: true,
    description: 'The stored placement before the apply; null when the bar was not hand-placed.',
  })
  beforeVisualStart!: string | null;

  @ApiProperty({
    format: 'date',
    description: 'Where the bar is drawn today, hand-placed or not.',
  })
  beforeDrawnStart!: string;

  @ApiProperty({ format: 'date' })
  targetStart!: string;

  @ApiProperty({
    description:
      'The bar carries a hand placement of its own, which the apply replaces. Undo restores it.',
  })
  wasPlaced!: boolean;

  @ApiProperty({
    description:
      'The resource frees up part-way through a day and a placement is a whole day, so the bar lands ' +
      'on the next working day’s start.',
  })
  roundedToNextDay!: boolean;

  @ApiProperty({
    enum: ['RESOURCE', 'LINKS'],
    description:
      '`RESOURCE`: a resource delays the bar, possibly as well as the work before it. `LINKS`: only the work before it moved and its own hand ' +
      'placement is now too early, so it moves with it.',
  })
  reason!: 'RESOURCE' | 'LINKS';
}

export class LevellingApplicationNamedActivityDto implements LevellingApplicationNamedActivity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class LevellingApplicationComputedFromDto {
  @ApiProperty({
    format: 'date-time',
    nullable: true,
    type: String,
    description:
      'When the schedule this preview was derived from was last calculated, so a client can refuse one older than the schedule it is showing.',
  })
  scheduleComputedAt!: string | null;
}

/**
 * What applying the plan's levelled positions would do: a read-only preview over an in-memory solve
 * (`docs/specs/apply-levelled-dates/`). Nothing in it is persisted and the write is the existing batch
 * placement route, sent `rows`.
 */
export class LevellingApplicationDto implements LevellingApplication {
  @ApiProperty({ type: LevellingApplicationComputedFromDto })
  computedFrom!: LevellingApplicationComputedFromDto;

  @ApiProperty({
    type: [LevellingApplicationRowDto],
    description:
      'The rows to send as the `placements` array of PATCH …/activities/placements, earliest target ' +
      'first. Empty when levelling is off or has moved nothing: do not send then (the batch route ' +
      'takes 1 to 2,000). Not capped. The number of rows need not equal the number of bars levelling ' +
      'moved: a bar that follows only its links moves without a row (`followingLinks`).',
  })
  rows!: LevellingApplicationRowDto[];

  @ApiProperty({
    type: [LevellingApplicationItemDto],
    description: 'One per row, in the same order.',
  })
  items!: LevellingApplicationItemDto[];

  @ApiProperty({
    type: [LevellingApplicationNamedActivityDto],
    description:
      'Activities levelling moved whose new position would be earlier than their links allow, and which carry no placement of their own: they are not written, and logic carries them.',
  })
  leftToLogic!: LevellingApplicationNamedActivityDto[];

  @ApiProperty({
    type: [LevellingApplicationNamedActivityDto],
    description:
      'Activities with no placement of their own that levelling moved only because the work before them moved: they get no row and follow their links once the rows are written. Not a conflict.',
  })
  followingLinks!: LevellingApplicationNamedActivityDto[];

  @ApiProperty({
    type: [LevellingApplicationNamedActivityDto],
    description:
      'Hand-placed activities the apply leaves earlier than their logic allows: the one kind of conflict it is allowed to leave, named.',
  })
  conflictingPlaced!: LevellingApplicationNamedActivityDto[];

  @ApiProperty({
    description:
      'Rows whose new position breaches a start or finish bound they did not breach before.',
  })
  laterThanBoundIntroduced!: number;

  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description: 'The plan’s PLACED finish as it stands (#404), from a real solve.',
  })
  projectFinishBefore!: string | null;

  @ApiProperty({
    format: 'date',
    nullable: true,
    type: String,
    description: 'The plan’s placed finish once the rows are written, from a real solve.',
  })
  projectFinishAfter!: string | null;

  @ApiProperty({
    description:
      'How many activities levelling would still move once the rows are written. One press is one step: this is reported, not chased.',
  })
  remainingAfterApply!: number;

  static from(result: LevellingApplication): LevellingApplicationDto {
    return {
      computedFrom: { scheduleComputedAt: result.computedFrom.scheduleComputedAt },
      rows: result.rows.map((r) => ({
        id: r.id,
        version: r.version,
        constraintType: r.constraintType,
        constraintDate: r.constraintDate,
        visualStart: r.visualStart,
        laneIndex: null,
      })),
      items: result.items.map((i) => ({ ...i })),
      leftToLogic: result.leftToLogic.map((a) => ({ id: a.id, name: a.name })),
      followingLinks: result.followingLinks.map((a) => ({ id: a.id, name: a.name })),
      conflictingPlaced: result.conflictingPlaced.map((a) => ({ id: a.id, name: a.name })),
      laterThanBoundIntroduced: result.laterThanBoundIntroduced,
      projectFinishBefore: result.projectFinishBefore,
      projectFinishAfter: result.projectFinishAfter,
      remainingAfterApply: result.remainingAfterApply,
    };
  }
}
