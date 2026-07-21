import type { Request } from 'express';

import type { GuestPrincipal } from './guest-principal';
import type { Principal } from './principal';

/** An Express request after the authentication guard has attached the principal. */
export interface AuthenticatedRequest extends Request {
  principal?: Principal;
}

/**
 * An Express request after the {@link ShareTokenGuard} has attached the guest
 * identity (ADR-0051). Distinct from {@link AuthenticatedRequest}: a guest route
 * is `@Public()` (no session principal) and carries a `guest`, never a `principal`.
 */
export interface GuestRequest extends Request {
  guest?: GuestPrincipal;
}
