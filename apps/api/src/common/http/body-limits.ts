/**
 * The JSON body caps (TECH_DEBT #407). Kept in one module so `app-setup.ts` (which enforces them)
 * and the OpenAPI text on the batch handlers (which states them) cannot drift apart.
 *
 * 2,000 placements at their widest valid row are ~356 KB compact; 512 KB leaves headroom for
 * whitespace and is the smallest round limit above that.
 */
export const ORG_SCOPED_JSON_LIMIT = '512kb';

/** Everything else, including every route a caller with no session can reach. */
export const DEFAULT_JSON_LIMIT = '64kb';

/** The path prefix under which the larger cap applies (URI-versioned, before the global prefix). */
export const ORG_SCOPED_PATH_PREFIX = '/api/v1/organizations';
