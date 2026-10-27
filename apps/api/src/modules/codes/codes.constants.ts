/**
 * The caps on a plan's code types and a type's values (p6-activity-codes Q4, database-design DB-4).
 * A CHECK cannot count rows, so each is a service count taken under the plan advisory lock; the
 * create and restore paths refuse more, which is also what bounds the lists and the reorder bodies.
 */
export const CODE_TYPE_LIMIT = 100;
export const CODE_VALUE_LIMIT = 1000;

/**
 * The text bounds, the same predicates as `ck_code_types_name_shape`, `ck_code_values_short_code_shape`
 * and `ck_code_values_description_shape`. The short-code and description maxima are placeholders until
 * a real P6 export is read (spec Q5), so a change here is a change to those CHECKs first.
 */
export const CODE_NAME_MAX = 80;
export const CODE_SHORT_CODE_MAX = 80;
export const CODE_DESCRIPTION_MAX = 255;

/** Machine-readable reasons carried in a code {@link ConflictError}/{@link ValidationError}. */
export const CODE_CONFLICT = {
  /** Another live type of the plan has this name, ignoring case (`uq_code_types_plan_name`). */
  TYPE_NAME_TAKEN: 'CODE_TYPE_NAME_TAKEN',
  /** Another live value of the type has this short code, ignoring case (`uq_code_values_type_short_code`). */
  VALUE_TAKEN: 'CODE_VALUE_TAKEN',
  /** The plan already has the maximum number of live code types. */
  TYPE_LIMIT: 'CODE_TYPE_LIMIT',
  /** The type already has the maximum number of live values. */
  VALUE_LIMIT: 'CODE_VALUE_LIMIT',
  /** The caller's version (or the set of rows it ordered) is no longer current. */
  STALE_VERSION: 'STALE_VERSION',
  /** The type is the plan's swimlane source; deleting it would leave the diagram without lanes. */
  TYPE_IS_SWIMLANE_SOURCE: 'CODE_TYPE_IS_SWIMLANE_SOURCE',
  /** A new assignment names a value that has been deleted. */
  VALUE_DELETED: 'CODE_VALUE_DELETED',
  /** An assignment names a value that belongs to another code type of the plan. */
  VALUE_WRONG_TYPE: 'CODE_VALUE_WRONG_TYPE',
} as const;
