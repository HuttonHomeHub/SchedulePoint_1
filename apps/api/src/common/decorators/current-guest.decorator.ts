import { createParamDecorator, UnauthorizedException, type ExecutionContext } from '@nestjs/common';

import type { GuestRequest } from '../auth/authenticated-request';
import { GuestPrincipal } from '../auth/guest-principal';

/**
 * Injects the {@link GuestPrincipal} into a handler parameter. Only valid on
 * guest routes behind the {@link ShareTokenGuard}; the guard has already resolved
 * the share token (or thrown 404), so a missing guest here is a wiring error.
 */
export const CurrentGuest = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): GuestPrincipal => {
    const request = ctx.switchToHttp().getRequest<GuestRequest>();
    if (!request.guest) {
      throw new UnauthorizedException();
    }
    return request.guest;
  },
);
