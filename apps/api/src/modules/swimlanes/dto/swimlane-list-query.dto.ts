import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

import { SWIMLANE_LIMIT } from './reorder-swimlanes.dto';

/**
 * The list query. The default page is the plan's whole cap, because the control that shows the
 * swimlanes needs all of them and the cap makes that one page (swimlanes spec §4.12).
 */
export class SwimlaneListQueryDto extends PaginationQueryDto {
  override limit = SWIMLANE_LIMIT;
}
