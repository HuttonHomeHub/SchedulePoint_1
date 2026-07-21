import { ApiProperty } from '@nestjs/swagger';

/**
 * Response of `GET /api/v1/version` — the API's own build version. Non-sensitive
 * build metadata (public, like the health probes). `'unknown'` when the manifest
 * couldn't be resolved.
 */
export class VersionResponseDto {
  @ApiProperty({ example: '0.25.0', description: 'The API package version, or "unknown".' })
  version!: string;
}
