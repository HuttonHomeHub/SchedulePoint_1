import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../common/decorators/public.decorator';

import { VersionResponseDto } from './dto/version-response.dto';
import { VersionService } from './version.service';

/**
 * The API build-version endpoint. Public (like the health probes) — it exposes
 * only the service's own package version, non-sensitive build metadata. The web
 * client reads it to display both service versions in the app shell.
 */
@ApiTags('version')
@Controller({ path: 'version', version: '1' })
export class VersionController {
  constructor(private readonly versionService: VersionService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get the API build version.' })
  @ApiOkResponse({ type: VersionResponseDto })
  getVersion(): VersionResponseDto {
    return { version: this.versionService.getVersion() };
  }
}
