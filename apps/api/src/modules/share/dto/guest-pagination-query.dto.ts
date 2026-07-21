import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/**
 * Pagination for the session-less guest read surface (ADR-0051 F-M3/F-M4). It raises the page-size
 * ceiling from the member default (100) to 500 for the two guest LIST endpoints only.
 *
 * WHY a bigger page: the guest view loads a plan's WHOLE network in one go (it renders the read-only
 * TSLD canvas, which needs every activity + edge). Under the deliberately tight guest throttle
 * (30 requests / 60 s per IP, {@link ../share-guest.controller GUEST_THROTTLE}), walking a large plan
 * at 100/page would spend the entire budget on a single legitimate first load (a 2,000-activity plan
 * ≈ 20 activity pages + ~20 dependency pages > 30) and self-429 mid-walk. At 500/page the same plan
 * loads in ≈ 4 + ~8 = a dozen requests, comfortably inside the window — so the anti-scrape throttle
 * stays tight AND an ordinary read never trips it. Responses stay bounded and field-stripped (the
 * guest DTOs carry no cost/resources/notes), so a 500-row page is a small payload.
 */
export class GuestPaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 500, default: 500, description: 'Page size.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  override limit = 500;
}
