import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { Public } from '../decorators/public.decorator';

import { CheckPasswordResetDto, PasswordResetCheckDto } from './dto/check-password-reset.dto';
import { PasswordResetCheckService } from './password-reset-check.service';

/**
 * Lets the reset page learn on arrival whether the emailed link still works. A read: it consumes
 * nothing and writes no audit row. `@Public()` because the person has no session; the token is the
 * only input and the answer is one bit about that token, never about an account.
 */
@ApiTags('password-reset')
@Controller({ path: 'password-reset', version: '1' })
export class PasswordResetCheckController {
  constructor(private readonly service: PasswordResetCheckService) {}

  @Post('check')
  @Public()
  // Better Auth's limiter does not see this route, and the reset POST's budget stays Better Auth's.
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Say whether an emailed reset link is still usable (public, token-gated).',
  })
  @ApiOkResponse({ type: PasswordResetCheckDto })
  @ApiUnprocessableEntityResponse({ description: 'Body failed validation (VALIDATION_FAILED).' })
  @ApiTooManyRequestsResponse({ description: 'Too many attempts from this address.' })
  async check(@Body() dto: CheckPasswordResetDto): Promise<PasswordResetCheckDto> {
    return { usable: await this.service.isUsable(dto.token) };
  }
}
