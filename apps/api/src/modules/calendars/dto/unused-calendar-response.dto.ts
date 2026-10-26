import { ApiProperty } from '@nestjs/swagger';
import type { UnusedCalendar } from '@repo/types';

class DeletedReferencersDto {
  @ApiProperty({ minimum: 0 })
  plans!: number;

  @ApiProperty({ minimum: 0 })
  activities!: number;
}

/** A project calendar that no active plan, activity or resource uses (ADR-0208 D5). */
export class UnusedCalendarResponseDto implements UnusedCalendar {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  archived!: boolean;

  @ApiProperty({ description: 'The optimistic-lock version at the time of the read.' })
  version!: number;

  @ApiProperty({
    type: DeletedReferencersDto,
    description:
      'Plans and activities in Recently deleted that still point at this calendar. Restoring one ' +
      'of them will ask for this calendar to be restored first.',
  })
  deletedReferencers!: DeletedReferencersDto;
}
