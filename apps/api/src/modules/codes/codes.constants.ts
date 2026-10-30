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
  /** A values-list `cursor` that is not a value of that type (unknown, purged, or another type's). */
  CURSOR_UNKNOWN: 'CODE_CURSOR_UNKNOWN',
  /** A new assignment names a value that has been deleted. */
  VALUE_DELETED: 'CODE_VALUE_DELETED',
  /** An assignment names a value that belongs to another code type of the plan. */
  VALUE_WRONG_TYPE: 'CODE_VALUE_WRONG_TYPE',
  /** A codes write's `lanes` were planned against a swimlane source that is no longer the plan's. */
  SWIMLANE_SOURCE_CHANGED: 'SWIMLANE_SOURCE_CHANGED',
  /** A codes write names an activity twice in `lanes`. */
  DUPLICATE_LANES_ACTIVITY_ID: 'DUPLICATE_LANES_ACTIVITY_ID',
  /** A codes write sends `lanes` without the type they were planned against. */
  LANES_CODE_TYPE_REQUIRED: 'LANES_CODE_TYPE_REQUIRED',
  /** An activity is in both `activities` and `lanes` of a codes write, at two different versions. */
  LANES_VERSION_DISAGREES: 'LANES_VERSION_DISAGREES',
  /** The activities of a codes write and its lane-only neighbours together pass the batch ceiling. */
  CODES_BATCH_TOO_LARGE: 'CODES_BATCH_TOO_LARGE',
  /** The same activity twice in one codes batch. */
  DUPLICATE_CODES_ACTIVITY_ID: 'DUPLICATE_CODES_ACTIVITY_ID',
  /** The same code type twice for one activity. */
  DUPLICATE_CODES_TYPE_ID: 'DUPLICATE_CODES_TYPE_ID',
} as const;

/**
 * The ceiling every activity batch body shares (`@ArrayMaxSize`), which a codes write also applies to
 * the union of its movers and its lane-only rows. An over-long single array is a plain validation
 * failure (422, no `reason`); only the union carries `CODES_BATCH_TOO_LARGE`.
 */
export const ACTIVITY_BATCH_LIMIT = 2000;
