import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthContextService } from '../auth/auth-context.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Global authentication guard (deny by default). Resolves the principal via the
 * {@link AuthContextService} seam and attaches it to the request; routes marked
 * `@Public()` are exempt. See docs/SECURITY_STANDARDS.md.
 */
@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authContext: AuthContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = await this.authContext.resolve(request);
    if (!principal) {
      throw new UnauthorizedException();
    }
    request.principal = principal;
    return true;
  }
}
