import { createParamDecorator, UnauthorizedException, type ExecutionContext } from '@nestjs/common';

import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { Principal } from '../auth/principal';

/**
 * Injects the authenticated {@link Principal} into a handler parameter.
 * Only valid on routes behind the authentication guard.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.principal) {
      throw new UnauthorizedException();
    }
    return request.principal;
  },
);
