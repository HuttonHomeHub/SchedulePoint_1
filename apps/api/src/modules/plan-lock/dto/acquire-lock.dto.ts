import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Body of `POST …/edit-lock`. `takeover` merely *requests* a steal; whether it is
 * permitted is decided server-side from the caller's permissions and the live lock
 * state (immediate override, or a request-control take-over once grace has elapsed
 * / the holder is inactive) — never trusted from the client (ADR-0028).
 */
export class AcquireLockDto {
  @ApiPropertyOptional({
    description: 'Take over a live lock held by another user (subject to server-side policy).',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  takeover?: boolean;
}
