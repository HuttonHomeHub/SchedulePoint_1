import { ApiProperty } from '@nestjs/swagger';
import {
  ACTIVITY_HISTORY_ORIGINS,
  ACTIVITY_HISTORY_SCOPES,
  type ActivityHistoryChange,
  type ActivityHistoryEntry,
  type ActivityHistoryOrigin,
  type ActivityHistoryScope,
} from '@repo/types';

/**
 * One entry of an activity's change history (ADR-0174). This is **working memory, not an audit
 * trail**: entries merge, can disappear when a change is undone, and are not tamper-resistant.
 */
export class ActivityHistoryActorDto {
  @ApiProperty({ description: 'The opaque user id.' })
  id!: string;

  @ApiProperty({
    description:
      "The user's display name resolved at read time — the anonymised tombstone after an erasure (ADR-0085).",
  })
  name!: string;
}

export class ActivityHistoryBatchDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: 'integer', description: 'How many entries the one write made.' })
  size!: number;
}

export class ActivityHistoryEntryResponseDto implements ActivityHistoryEntry {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: ActivityHistoryActorDto })
  actor!: ActivityHistoryActorDto;

  @ApiProperty({ enum: ACTIVITY_HISTORY_SCOPES })
  scope!: ActivityHistoryScope;

  @ApiProperty({ format: 'date-time', description: 'When the entry was first recorded.' })
  firstRecordedAt!: string;

  @ApiProperty({ format: 'date-time', description: 'When the latest merged save was recorded.' })
  lastRecordedAt!: string;

  @ApiProperty({
    type: 'integer',
    description: 'How many saves this entry absorbed (1 = one save).',
  })
  editCount!: number;

  @ApiProperty({
    type: ActivityHistoryBatchDto,
    nullable: true,
    description:
      'Set for an entry written together with others (a group move, a batch re-parent, a dissolve, ' +
      'a delete or restore); `size` is the number of entries the write made. Null otherwise.',
  })
  batch!: ActivityHistoryBatchDto | null;

  @ApiProperty({
    enum: ACTIVITY_HISTORY_ORIGINS,
    nullable: true,
    description:
      'Null for a change made to this activity directly. Otherwise why an entry exists that the actor ' +
      'did not make to it: `ACTIVITY_DELETED` / `ACTIVITY_RESTORED` (a link to a surviving activity ' +
      'went or came back because the other end was deleted or restored) and `SUMMARY_DISSOLVED` (a ' +
      'child promoted when its summary was dissolved).',
  })
  origin!: ActivityHistoryOrigin | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Keyed by item: a field name, `link:<id>`, `xlink:<id>` (a cross-plan link, whose `other` also ' +
      'carries `planId` and `planName`) or `assignment:<id>`. A field item is ' +
      '`{ from, to }`; a description is `{ changed: true }` only; a link or assignment carries the ' +
      'other end or resource **as it was named when recorded**, with `from: null` meaning added and ' +
      '`to: null` meaning removed. Cost items are absent without `cost:read`.',
  })
  changes!: Record<string, ActivityHistoryChange>;
}
