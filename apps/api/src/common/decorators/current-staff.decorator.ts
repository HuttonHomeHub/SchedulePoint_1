import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { StaffRequest } from '../auth/authenticated-request';
import { StaffPrincipal } from '../auth/staff-principal';
import { NotFoundError } from '../errors/domain-errors';

/**
 * Injects the {@link StaffPrincipal} into a handler parameter. Only valid on staff routes behind
 * the {@link StaffGuard}; the guard has already resolved the allowlist (or thrown 404), so a
 * missing staff identity here is a wiring error rather than an authorisation outcome.
 *
 * It throws the same {@link NotFoundError} the guard does, **not** a 401. This branch is
 * unreachable today — the controller-level guard always runs first — but "unreachable" is a fact
 * about today's wiring, and the failure mode of getting it wrong is a decorator reused on a
 * differently-guarded route that answers 401 and thereby confirms the staff surface exists. Failing
 * closed in the same shape costs nothing and removes the question.
 */
export const CurrentStaff = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): StaffPrincipal => {
    const request = ctx.switchToHttp().getRequest<StaffRequest>();
    if (!request.staff) {
      throw new NotFoundError('Not found');
    }
    return request.staff;
  },
);
