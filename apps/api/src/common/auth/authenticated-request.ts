import type { Request } from 'express';

import type { GuestPrincipal } from './guest-principal';
import type { Principal } from './principal';
import type { StaffPrincipal } from './staff-principal';

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

/**
 * An Express request after the {@link StaffGuard} has attached the staff identity (ADR-0086).
 *
 * A sibling of {@link GuestRequest} rather than a widening of {@link AuthenticatedRequest}, and for
 * the same reason the principal types are separate: a controller cannot then accidentally read one
 * where it meant the other. A staff route carries `staff`; it never reads `principal`, even though
 * the session guard has run and both could physically be present on the object.
 */
export interface StaffRequest extends Request {
  staff?: StaffPrincipal;
}
