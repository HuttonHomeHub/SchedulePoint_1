import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { Principal } from '../../common/auth/principal';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

import { MeResponseDto } from './dto/me-response.dto';
import { MeService } from './me.service';

/**
 * The current-user endpoint. Authenticated (deny-by-default via the global
 * guards); returns 401 when there is no valid session. This is the walking
 * skeleton's one authenticated read, proving web ↔ api ↔ Postgres end-to-end.
 */
@ApiTags('me')
@ApiCookieAuth('schedulepoint.session_token')
@Controller({ path: 'me', version: '1' })
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Get()
  @ApiOperation({ summary: 'Get the current user and their organisation memberships.' })
  @ApiOkResponse({ type: MeResponseDto })
  getMe(@CurrentUser() principal: Principal): Promise<MeResponseDto> {
    return this.meService.getProfile(principal);
  }
}
