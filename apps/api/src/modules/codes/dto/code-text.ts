/** Trim a string value before validation; leave non-strings untouched (the swimlanes pattern). */
export const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Trim, and read an empty result as "none" (`null`). The description column stores NULL, never `''`
 * (`ck_code_values_description_shape`), so an empty or blank description is a clear, not a 422.
 */
export const trimToNull = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/**
 * The same predicate as the shape CHECKs' `!~ '[[:cntrl:]]'`: no control character, so a newline or a
 * tab is a 422 at the boundary rather than a 500 from the CHECK.
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the point.
export const NO_CONTROL_CHARACTERS = /^[^\u0000-\u001F\u007F-\u009F]*$/;

/** The INT column's ceiling: a larger `version` would overflow the comparison and answer 500. */
export const MAX_VERSION = 2147483647;
