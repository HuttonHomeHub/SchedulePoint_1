import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Errors this app has seen a body parser pass to `next`. A positive marker set by OUR code in
 * `app-setup.ts`, not a property of the error: a library tag can be missing, and a bare `status`
 * is not evidence of anything. body-parser wraps any raw-body/zlib failure — a gzip body of junk
 * bytes is `Z_DATA_ERROR` — as `createError(400, error)` with **no `type`** (`body-parser/lib/read.js`
 * :125, :136), so the tag alone cannot recognise it; the filter needs to know where the error came
 * from. A WeakSet, so nothing a client sends can set it and the error object is not mutated.
 */
const fromBodyParser = new WeakSet<object>();

export function isBodyParserError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && fromBodyParser.has(error);
}

/** Wrap a body-parser middleware so an error it hands to `next` is recorded as coming from it. */
export function tagBodyParserErrors(parser: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    parser(req, res, (error?: unknown) => {
      if (typeof error === 'object' && error !== null) fromBodyParser.add(error);
      next(error);
    });
  };
}
