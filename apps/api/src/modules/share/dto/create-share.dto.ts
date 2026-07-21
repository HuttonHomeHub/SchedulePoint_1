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
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200)
  label?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Optional expiry instant (ISO 8601). Omit for a link that never expires.',
  })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
