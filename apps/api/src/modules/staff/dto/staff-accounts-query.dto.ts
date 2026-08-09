import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The only caller-supplied input on the whole staff surface.
 *
 * Validated as a DTO rather than taken as a bare `@Query('cursor')` string, which is what it was
 * until the security review. It was never exploitable — an unknown cursor makes Prisma raise
 * `P2025`, which the global exception filter already turns into a plain 404 with no internals — but
 * "not exploitable because something downstream happens to handle it" is a property of another
 * file, and on this surface the input boundary is the thing worth being able to point at.
 *
 * Deliberately **not** `@IsUUID()`: these are Better Auth user ids, whose format is that library's
 * to choose and has changed before. A length bound and a string check reject the abuse (a megabyte
 * of query string) without encoding a guess about somebody else's id scheme.
 *
 * There is no `limit`. The page size is a constant in the service, so a caller cannot widen a
 * response that carries customer addresses.
 */
export class StaffAccountsQueryDto {
  @ApiPropertyOptional({
    description: 'Opaque cursor from a previous response’s `nextCursor`. Omit for the first page.',
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  cursor?: string;
}
