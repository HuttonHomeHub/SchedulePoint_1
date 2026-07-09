import { SetMetadata } from '@nestjs/common';

import type { Permission } from '../auth/principal';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Declares the permissions a route requires. Enforced by the PermissionsGuard
 * against the organisation referenced by the request (resource scope). Services
 * re-check scope authoritatively (defence in depth).
 */
export const RequirePermissions = (...permissions: Permission[]): MethodDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions);
