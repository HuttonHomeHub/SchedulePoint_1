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
 * What `!~ '[[:cntrl:]]'` in the shape CHECKs refuses, on any collation: the C0 and C1 controls, plus
 * U+2028 and U+2029 (line and paragraph separators) and U+FFF9 to U+FFFB (interlinear annotation
 * marks), which the CHECK also counts. A name the DTO let through and the CHECK refused would be a raw
 * 500, so the two must agree: a newline, a tab or any of these is a 422 at the boundary.
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the point.
export const NO_CONTROL_CHARACTERS = /^[^\u0000-\u001F\u007F-\u009F\u2028\u2029\uFFF9-\uFFFB]*$/;

/** The INT column's ceiling: a larger `version` would overflow the comparison and answer 500. */
export const MAX_VERSION = 2147483647;
