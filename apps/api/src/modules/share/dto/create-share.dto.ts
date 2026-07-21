import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Request body to create an External-Guest share link for a plan (ADR-0051 F-M2).
 * Both fields are optional: an unlabelled, non-expiring link is valid (revocation is
 * the primary control, §5). `expiresAt` must be a future instant — enforced in the
 * service (a past/zero TTL is a 422), since class-validator cannot express "future".
 */
export class CreateShareDto {
  @ApiPropertyOptional({
    maxLength: 200,
    description: 'Optional human label for the management list (e.g. "Client review – Acme").',
  })
  // Trim, and treat an empty-after-trim label as omitted (→ stored null, not "") so callers
  // get consistent "no label" semantics rather than an empty string (the note-body precedent).
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description:
      'Optional expiry instant (ISO 8601). Omit (or null) for a link that never expires.',
  })
  // Normalise an explicit `null` to "omitted" so a caller meaning "no expiry" doesn't trip the
  // ISO-8601 check / a misleading SHARE_EXPIRY_IN_PAST (`@IsOptional` already skips `undefined`).
  @Transform(({ value }: { value: unknown }) => (value === null ? undefined : value))
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
