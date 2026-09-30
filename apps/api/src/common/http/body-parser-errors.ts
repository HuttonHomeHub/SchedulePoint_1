import type { NextFunction, Request, Response } from 'express';

/**
 * Errors this app has seen a body parser pass to `next`. A positive marker set by OUR code in
 * `app-setup.ts`, not a property of the error: a library tag can be missing, and a bare `status`
 * is not evidence of anything. body-parser wraps any raw-body/zlib failure — a gzip body of junk
 * bytes is `Z_DATA_ERROR` — as `createError(400, error)` with **no `type`** (`body-parser/lib/read.js`
 * :125, :136), so the tag alone cannot recognise it; the filter needs to know where the error came
 * from. A WeakSet, so nothing a client sends can set it.
 */
const fromBodyParser = new WeakSet<object>();

export function isBodyParserError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && fromBodyParser.has(error);
}

/**
 * What {@link tagBodyParserErrors} hands on instead of the parser's own error. **It must not be a `SyntaxError`.**
 * body-parser's JSON failure IS one, and Nest's router error layer rewrites any `SyntaxError` into
 * `new BadRequestException(err.message)` before a filter sees it (`@nestjs/core`
 * `router/routes-resolver.js:99-100`, `mapExternalException`) — so the filter received an
 * `HttpException` carrying the parser's text ("Unexpected end of JSON input"), echoed it to the
 * client, and never saw the `type` tag. Found by `body-limit.e2e-spec.ts`; the filter's unit spec
 * could not see it, because it never runs Nest's router. Only `type` and `status` are carried, the
 * original stays on `cause` for the log, and nothing else of the parser's error travels.
 */
class BodyParserFailure extends Error {
  readonly type: unknown;
  readonly status: unknown;
  constructor(original: object) {
    super('The request body could not be parsed.', { cause: original });
    this.name = 'BodyParserFailure';
    this.type = (original as { type?: unknown }).type;
    this.status = (original as { status?: unknown }).status;
  }
}

/**
 * An Express **error** middleware (four parameters), mounted directly after the body parsers, that
 * records the error it receives as a parser failure and hands on a {@link BodyParserFailure}.
 *
 * **An error handler, not a wrapper around each parser, so a request whose body parses never
 * passes through this code at all.** The first version wrapped each parser's `next`; its success
 * path was a pass-through by reading, and yet with it mounted the base Playwright suite's sign-up
 * journeys failed in Firefox on CI and passed with it removed (PR #729's bisect, 2026-09-30) —
 * a mechanism nobody found. Express only calls a four-parameter layer when an error is being
 * passed, so this shape keeps every successful request on exactly the path it took before.
 *
 * What it can see: an error from any layer before it, which is helmet, CORS and the two parsers
 * (Better Auth terminates its own requests above them). helmet and CORS with a static origin list
 * do not pass errors, so in practice this is the parsers' — and the filter still believes a bare
 * `status` only for a 400.
 */
export function tagBodyParserErrors(
  error: unknown,
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (typeof error !== 'object' || error === null) {
    next(error);
    return;
  }
  const failure = new BodyParserFailure(error);
  fromBodyParser.add(failure);
  next(failure);
}
