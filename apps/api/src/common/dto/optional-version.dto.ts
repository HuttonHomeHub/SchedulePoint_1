import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * An optional optimistic-locking `version` on a write that has never taken one — a single-row
 * `DELETE` (as `?version=`) or a dissolve (as the body). **Opt-in and additive**: absent, the write
 * behaves exactly as before; present, a row at any other version is refused with 409
 * `STALE_VERSION` and nothing changes (`docs/TECH_DEBT.md` #450). A query parameter rather than a
 * body for `DELETE`, because intermediaries handle a `DELETE` body poorly, and not `If-Match`,
 * because no route here uses ETags.
 */
export class OptionalVersionDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: 2147483647,
    description:
      'The version the client last read. When sent, a row at any other version is refused ' +
      '(409 `STALE_VERSION`) and nothing is deleted. Omit it to delete without the check.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // The column is a 32-bit INTEGER: a larger value would reach the query and answer 500, not 422.
  @Max(2147483647)
  version?: number;
}
