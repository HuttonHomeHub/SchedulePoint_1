import { ApiProperty } from '@nestjs/swagger';
import type { BulkDeleteCalendarsResult } from '@repo/types';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

/** The most calendars one bulk delete takes. The web sends larger sets in pages of this size. */
export const BULK_DELETE_CALENDARS_MAX = 200;

/** Request body for deleting several calendars at once (ADR-0208 D5). */
export class BulkDeleteCalendarsDto {
  @ApiProperty({
    type: [String],
    format: 'uuid',
    minItems: 1,
    maxItems: BULK_DELETE_CALENDARS_MAX,
    description:
      'The calendars to delete. All or nothing: if any is unknown, not permitted, or still used by ' +
      'an active plan, activity or resource, none is deleted.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BULK_DELETE_CALENDARS_MAX)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids!: string[];
}

class DeletedCalendarDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({
    format: 'uuid',
    description: 'This calendar’s own delete batch, so it restores alone from Recently deleted.',
  })
  deleteBatchId!: string;
}

/** What a bulk delete removed. */
export class BulkDeleteCalendarsResponseDto implements BulkDeleteCalendarsResult {
  @ApiProperty({ type: [DeletedCalendarDto] })
  deleted!: DeletedCalendarDto[];
}
