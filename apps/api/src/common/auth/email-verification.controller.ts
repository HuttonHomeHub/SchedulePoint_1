import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiGoneResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { Public } from '../decorators/public.decorator';

import {
  ConfirmEmailVerificationDto,
  EmailVerificationConfirmedDto,
} from './dto/confirm-email-verification.dto';
import { EmailVerificationService } from './email-verification.service';

/**
 * The press behind the emailed verification link (TECH_DEBT #88). The link opens a page; only this
 * `POST`, sent when the person presses Confirm, verifies the address — so a scanner that merely
 * fetches the link changes nothing.
 *
 * `@Public()` because the person usually has no session yet (sign-up withholds one while
 * verification is required); the token is the authority, as on the password-reset POST.
 */
@ApiTags('email-verification')
@Controller({ path: 'email-verification', version: '1' })
export class EmailVerificationController {
  constructor(private readonly service: EmailVerificationService) {}

  @Post('confirm')
  @Public()
  // The token is HS256-signed, so this bounds cost rather than guessing; Better Auth's own limiter
  // applies to the inner call as well.
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm an email address from the emailed link (public, token-gated).',
  })
  @ApiOkResponse({ type: EmailVerificationConfirmedDto })
  @ApiBadRequestResponse({ description: 'The token is malformed, forged or names no account.' })
  @ApiGoneResponse({ description: 'The link has expired (code VERIFICATION_LINK_EXPIRED).' })
  @ApiTooManyRequestsResponse({ description: 'Too many attempts from this address.' })
  async confirm(
    @Body() dto: ConfirmEmailVerificationDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('x-forwarded-for') forwardedFor: string | undefined,
  ): Promise<EmailVerificationConfirmedDto> {
    await this.service.confirm(dto.token, { userAgent, forwardedFor });
    return { verified: true };
  }
}
