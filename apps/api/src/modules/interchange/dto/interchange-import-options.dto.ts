import { ApiPropertyOptional } from '@nestjs/swagger';
import { type ResourceCollisionResolution } from '@repo/interchange';
import { CALENDAR_SCOPES, type CalendarScope } from '@repo/types';
import { Transform } from 'class-transformer';
import { IsIn, IsObject, IsOptional, Validate } from 'class-validator';

import { IsResourceResolutionMap, RESOLUTIONS_UNPARSEABLE } from './resource-resolution-validator';

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

  /**
   * The planner's answer to each resource-name collision the dry-run reported, keyed by the report's
   * `resourceKey`. A JSON object, sent as a multipart string field — hence the parse in `@Transform`.
   *
   * There is deliberately **no default**. A collision means the file names a resource the organisation
   * already has under that name and nothing identified it as the same row, so both answers change real
   * data: reuse discards the file's own rate and calendar for it, and a separate copy splits one crew's
   * demand across two library rows that levelling, over-allocation and Earned Value all believe. A
   * commit with an unanswered collision is refused (`UNRESOLVED_RESOURCE_COLLISIONS`).
   */
  @ApiPropertyOptional({
    type: 'string',
    example: '{"RSRC:1234":"REUSE_EXISTING","RSRC:5678":"CREATE_COPY"}',
    description:
      'JSON object mapping each `resourceCollisions[].resourceKey` from the dry-run report to ' +
      '`REUSE_EXISTING` (bind the imported assignments to the library resource already there) or ' +
      '`CREATE_COPY` (create a separate resource, renamed, so the file’s own rate and calendar are ' +
      'kept). Required on commit for every collision the dry-run reported.',
  })
  @IsOptional()
  // Multipart fields arrive as strings. A malformed value becomes `RESOLUTIONS_UNPARSEABLE` rather
  // than throwing here, so the caller gets a 422 with a field-level message instead of a 500.
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return RESOLUTIONS_UNPARSEABLE;
    }
  })
  @IsObject()
  @Validate(IsResourceResolutionMap)
  resourceResolutions?: Record<string, ResourceCollisionResolution>;
}
