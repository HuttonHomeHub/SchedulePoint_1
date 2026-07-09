import type { Request } from 'express';

import type { Principal } from './principal';

/** An Express request after the authentication guard has attached the principal. */
export interface AuthenticatedRequest extends Request {
  principal?: Principal;
}
