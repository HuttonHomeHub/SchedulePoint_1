import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Base query params for cursor-paginated list endpoints (see docs/API.md).
 * Feature list DTOs extend this to add filters and a typed `sort` field.
 *
 * Deliberately no `order`. It used to live here, which meant every list
 * advertised a sort-direction param in its OpenAPI while all but one ignored
 * it — a documented no-op is worse than an absent feature, because a client
 * that sends `order=desc` gets a 200 and the wrong page (TECH_DEBT #19). A list
 * whose direction is genuinely caller-controllable declares `order` in its own
 * query DTO and threads it into its `orderBy` — see
 * `ListBaselinesQueryDto`, the one that does.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20, description: 'Page size.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ description: 'Opaque cursor from a previous response.' })
  @IsOptional()
  @IsString()
  cursor?: string;
}
