import { ApiPropertyOptional } from '@nestjs/swagger';
import { SWIMLANE_LIMIT } from '@repo/types';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/**
 * The list query. The default page is the plan's whole cap, because the control that shows the
 * swimlanes needs all of them and the cap makes that one page (swimlanes spec §4.12).
 */
export class SwimlaneListQueryDto extends PaginationQueryDto {
  // Re-declared so the OpenAPI states this list's own default; the inherited decorator says 20.
  @ApiPropertyOptional({
    minimum: 1,
    maximum: SWIMLANE_LIMIT,
    default: SWIMLANE_LIMIT,
    description: 'Page size.',
  })
  override limit = SWIMLANE_LIMIT;
}
