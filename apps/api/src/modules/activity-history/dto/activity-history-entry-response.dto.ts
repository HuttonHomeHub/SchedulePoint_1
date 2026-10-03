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

  @ApiProperty({ description: 'How many activities the one write recorded.' })
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

  @ApiProperty({ description: 'How many saves this entry absorbed (1 = one save).' })
  editCount!: number;

  @ApiProperty({ type: ActivityHistoryBatchDto, nullable: true })
  batch!: ActivityHistoryBatchDto | null;

  @ApiProperty({ enum: ACTIVITY_HISTORY_ORIGINS, nullable: true })
  origin!: ActivityHistoryOrigin | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'Keyed by item: a field name, `link:<id>` or `assignment:<id>`. A field item is ' +
      '`{ from, to }`; a description is `{ changed: true }` only; a link or assignment carries the ' +
      'other end or resource **as it was named when recorded**, with `from: null` meaning added and ' +
      '`to: null` meaning removed. Cost items are absent without `cost:read`.',
  })
  changes!: Record<string, ActivityHistoryChange>;
}
