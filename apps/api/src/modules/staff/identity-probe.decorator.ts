import { SetMetadata } from '@nestjs/common';

export const IDENTITY_PROBE = 'staff:identity-probe';

/**
 * Marks the one staff route whose **refusal is not evidence** — `GET /staff/me`.
 *
 * Every other staff route is asked by somebody who already knows the console exists. This one is
 * asked by the app itself, for every reader, to decide whether to offer a menu item; a 404 is the
 * expected answer for essentially everyone in the installation. `StaffGuard` therefore skips the
 * `staff.access_denied` row here — otherwise an ordinary member opening their account menu would
 * write one, into a table that refuses `DELETE` and has no retention sweep, burying the refusals
 * that do mean something (a caller who knows the panel URLs and is trying them).
 *
 * **Metadata on the handler rather than a match on `request.url`, and the difference is not
 * stylistic.** The string version worked, and the M6-follow-up security review proved it worked by
 * driving real Express with dot-segments, encoded separators, matrix params and null bytes — but it
 * worked *because* Express happens not to normalise dot-segments and matches route literals
 * exactly. That is undocumented behaviour of a dependency, load-bearing for an audit exemption, and
 * it would change silently under a move to Fastify or a `strict`/normalisation option nobody
 * connected to this file. It also mis-classified `/staff/ME` and `/staff/me/` — safely, by
 * over-auditing, but by accident rather than design.
 *
 * The metadata says what the exemption actually means: *this is the identity handler*. There is no
 * routing behaviour left to depend on.
 */
export const IdentityProbe = () => SetMetadata(IDENTITY_PROBE, true);
