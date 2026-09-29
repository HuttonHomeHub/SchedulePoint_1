import type { NextFunction, Request, RequestHandler, Response } from 'express';

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
 * What the wrapper hands on instead of the parser's own error. **It must not be a `SyntaxError`.**
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

/** Wrap a body-parser middleware so an error it hands to `next` is recorded as coming from it. */
export function tagBodyParserErrors(parser: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    parser(req, res, (error?: unknown) => {
      if (typeof error !== 'object' || error === null) {
        next(error);
        return;
      }
      const failure = new BodyParserFailure(error);
      fromBodyParser.add(failure);
      next(failure);
    });
  };
}
