import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthenticatedRequest } from '../auth/authenticated-request';
import type { Permission } from '../auth/principal';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

/**
 * Enforces `@RequirePermissions(...)` as a **coarse capability gate**: the
 * principal must hold each required permission in at least one organisation. The
 * authoritative, organisation-scoped check happens in the service against the
 * specific resource (defence in depth — see docs/SECURITY_STANDARDS.md).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required =
      this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    if (required.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = request.principal;
    if (!principal) {
      throw new ForbiddenException();
    }

    const allowed = required.every((permission) => principal.canAnywhere(permission));
    if (!allowed) {
      throw new ForbiddenException();
    }
    return true;
  }
}
