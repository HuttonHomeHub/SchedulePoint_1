/** Base slug length cap — leaves headroom for a uniqueness suffix (`-<n>`). */
const MAX_BASE_SLUG_LENGTH = 56;

/**
 * Derive a URL-safe slug from an organisation name (en-GB, v1). Lower-cased,
 * non-alphanumerics collapsed to single hyphens, trimmed, length-capped (with
 * room left for the service's uniqueness suffix). Falls back to `org` when a
 * name has no usable characters; the service guarantees uniqueness by suffixing.
 */
export function slugify(input: string): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_BASE_SLUG_LENGTH)
    .replace(/-+$/g, '');
  return slug.length >= 2 ? slug : 'org';
}
