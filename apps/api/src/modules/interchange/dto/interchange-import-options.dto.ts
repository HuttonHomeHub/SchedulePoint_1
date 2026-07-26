import { ApiPropertyOptional } from '@nestjs/swagger';
import { CALENDAR_SCOPES, type CalendarScope } from '@repo/types';
import { IsIn, IsOptional } from 'class-validator';

/**
 * The optional, non-file fields of an interchange upload (ADR-0053 §5). Sent as ordinary multipart form
 * fields alongside the `file` part, so they arrive as strings — hence the `@IsIn` over an enum union
 * rather than a numeric/boolean transform.
 *
 * Deliberately tiny: the import's *behaviour* is decided by the pure pipeline, and the one thing the
 * caller gets to decide is whether a foreign file's **global** calendars may be written into the shared
 * organisation library. Everything else about the tier is an invariant, not an option.
 */
export class InterchangeImportOptionsDto {
  @ApiPropertyOptional({
    enum: CALENDAR_SCOPES,
    default: 'PROJECT',
    description:
      'Where the file’s GLOBAL calendars (P6 `clndr_type = CA_Base`) should be created. ' +
      '`PROJECT` (the default) creates them in the target project, so an imported file never writes ' +
      'the shared organisation library; `ORG` opts them into that shared library. Project calendars ' +
      'always land in the target project, and a calendar an imported resource uses is always created ' +
      'at organisation scope (a resource can hold nothing else). Every decision is named in the report.',
  })
  @IsOptional()
  @IsIn(CALENDAR_SCOPES)
  globalCalendarScope?: CalendarScope;
}
