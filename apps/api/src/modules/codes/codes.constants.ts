// The caps and text bounds live in `@repo/types`, so the web reads the same numbers; re-exported here
// so the module's imports stay local.
export {
  CODE_DESCRIPTION_MAX,
  CODE_NAME_MAX,
  CODE_SHORT_CODE_MAX,
  CODE_TYPE_LIMIT,
  CODE_VALUE_LIMIT,
} from '@repo/types';

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
