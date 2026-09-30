/**
 * The JSON body caps (TECH_DEBT #407). Kept in one module so `app-setup.ts` (which enforces them)
 * and the OpenAPI text on the batch handlers (which states them) cannot drift apart.
 *
 * 2,000 placements at their widest valid row are ~356 KB compact; 512 KB leaves headroom for
 * whitespace and is the smallest round limit above that.
 */
export const ORG_SCOPED_JSON_LIMIT = '512kb';

/**
 * Everything else, including every route a caller with no session can reach, and `/api/auth/*`
 * (TECH_DEBT #416). A byte count rather than `'64kb'` because the Better Auth guard in
 * `app-setup.ts` compares a declared `Content-Length` against it before deciding whether to read.
 */
export const DEFAULT_JSON_LIMIT_BYTES = 64 * 1024;
export const DEFAULT_JSON_LIMIT = DEFAULT_JSON_LIMIT_BYTES;

/** The path prefix under which the larger cap applies (URI-versioned, before the global prefix). */
export const ORG_SCOPED_PATH_PREFIX = '/api/v1/organizations';
