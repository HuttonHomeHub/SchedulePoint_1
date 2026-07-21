import { ApiProperty } from '@nestjs/swagger';
import type { PlanShare } from '@prisma/client';

/**
 * A share link as returned by the management API (ADR-0051 F-M2) — METADATA ONLY. The
 * raw token and its hash are NEVER exposed here; the raw token is returned exactly once,
 * on create, via {@link CreatedShareDto}. `active` is derived server-side (not revoked and
 * not past its expiry) so the client can render live vs dead links without re-deriving the
 * rule. Date fields are ISO-8601 strings (the note/baseline DTO convention) so the DTO's
 * declared type matches the wire format and the generated OpenAPI schema is accurate.
 */
export class ShareResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid', description: 'The plan this link grants read access to.' })
  planId!: string;

  @ApiProperty({ nullable: true, type: String, description: 'Optional human label.' })
  label!: string | null;

  @ApiProperty({ description: 'True if the link is not revoked and not past its expiry.' })
  active!: boolean;

  @ApiProperty({
    nullable: true,
    type: String,
    format: 'date-time',
    description: 'Expiry instant, if any.',
  })
  expiresAt!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    format: 'date-time',
    description: 'When it was revoked, if it was.',
  })
  revokedAt!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    format: 'date-time',
    description: 'Best-effort last guest access (coalesced telemetry).',
  })
  lastAccessedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  /** Map a stored row to its metadata view (no token/hash), computing `active` against `now`. */
  static from(share: PlanShare, now: Date = new Date()): ShareResponseDto {
    const dto = new ShareResponseDto();
    dto.id = share.id;
    dto.planId = share.planId;
    dto.label = share.label;
    dto.expiresAt = share.expiresAt?.toISOString() ?? null;
    dto.revokedAt = share.revokedAt?.toISOString() ?? null;
    dto.lastAccessedAt = share.lastAccessedAt?.toISOString() ?? null;
    dto.createdAt = share.createdAt.toISOString();
    dto.active =
      share.revokedAt === null &&
      (share.expiresAt === null || share.expiresAt.getTime() > now.getTime());
    return dto;
  }
}

/**
 * The create response (ADR-0051 F-M2): the new link's metadata PLUS the one-time guest
 * `url` carrying the raw token in its fragment (`…/share#sp_share_…`). The raw token is
 * returned here ONCE and never again — it is stored only as a hash.
 */
export class CreatedShareDto {
  @ApiProperty({
    description:
      'The one-time guest URL with the raw token in its fragment. Returned ONCE; copy it now — ' +
      'it cannot be retrieved again (only its hash is stored).',
  })
  url!: string;

  @ApiProperty({ type: ShareResponseDto })
  share!: ShareResponseDto;

  static fromWithUrl(share: PlanShare, url: string): CreatedShareDto {
    const dto = new CreatedShareDto();
    dto.url = url;
    dto.share = ShareResponseDto.from(share);
    return dto;
  }
}
