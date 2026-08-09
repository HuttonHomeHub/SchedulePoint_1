import { createParamDecorator, UnauthorizedException, type ExecutionContext } from '@nestjs/common';

import type { StaffRequest } from '../auth/authenticated-request';
import { StaffPrincipal } from '../auth/staff-principal';

/**
 * Injects the {@link StaffPrincipal} into a handler parameter. Only valid on staff routes behind
 * the {@link StaffGuard}; the guard has already resolved the allowlist (or thrown 404), so a
 * missing staff identity here is a wiring error rather than an authorisation outcome.
 */
export const CurrentStaff = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): StaffPrincipal => {
    const request = ctx.switchToHttp().getRequest<StaffRequest>();
    if (!request.staff) {
      throw new UnauthorizedException();
    }
    return request.staff;
  },
);
