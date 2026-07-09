import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as public, opting it out of the global authentication guard.
 * Everything is protected by default; use this only for genuinely public
 * endpoints (health checks, sign-in).
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
