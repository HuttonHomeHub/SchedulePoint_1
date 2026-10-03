import type {
  ActivitySummary,
  DependencyType,
  LagCalendarSource,
  ResourceCurveType,
} from './index.js';

/**
 * **Per-activity change history** (ADR-0174) — the vocabulary the API records and the web renders.
 *
 * ## A persisted vocabulary: add, never rename
 *
 * Every key below is stored inside `activity_history_entries.changes`, so a rename would orphan
 * every old row without a data migration. A key may be **added**; one that stops being recorded
 * stays here so old entries still render. The web formatter keys its labels off this table, so a
 * missing label for a stored key is a compile error there rather than a blank in a timeline.
 */

/** Which kind of write produced an entry (ADR-0174 D2). `PLACEMENT` arrives with the batch paths. */
export const ACTIVITY_HISTORY_SCOPES = [
  'DEFINITION',
  'PROGRESS',
  'PLACEMENT',
  'LOGIC',
  'RESOURCES',
] as const;
export type ActivityHistoryScope = (typeof ACTIVITY_HISTORY_SCOPES)[number];

/** Why an entry exists that the actor did not make directly to this activity (a knock-on). */
export const ACTIVITY_HISTORY_ORIGINS = [
  'ACTIVITY_DELETED',
  'ACTIVITY_RESTORED',
  'SUMMARY_DISSOLVED',
] as const;
export type ActivityHistoryOrigin = (typeof ACTIVITY_HISTORY_ORIGINS)[number];

/**
 * How a recorded field's value is stored and compared.
 *
 * `reference` holds `{ id, name }` and net-zero compares the **id only**, never the name stored
 * beside it. `description` is never stored as text: `{ len, h }` only (ADR-0174 D3). `instant` is a
 * UTC ISO-8601 timestamp, not a calendar day — the two external dates are `timestamptz`.
 */
export type ActivityHistoryFieldKind =
  | 'text'
  | 'description'
  | 'enum'
  | 'integer'
  | 'boolean'
  | 'date'
  | 'instant'
  | 'money'
  | 'reference';

interface FieldSpec {
  readonly kind: ActivityHistoryFieldKind;
  /** Shown only to a reader holding `cost:read`; stripped server-side from everyone else. */
  readonly cost?: true;
}

/**
 * The activity's own fields the recorder diffs — **inputs only** (ADR-0174 D3). Typed against
 * {@link ActivitySummary} so a misspelt key is a compile error. Engine outputs (early/late dates,
 * floats, flags, the levelled overlay) and the derived `status` are deliberately absent.
 */
export const ACTIVITY_HISTORY_FIELDS = {
  name: { kind: 'text' },
  code: { kind: 'text' },
  description: { kind: 'description' },
  type: { kind: 'enum' },
  durationMinutes: { kind: 'integer' },
  durationType: { kind: 'enum' },
  constraintType: { kind: 'enum' },
  constraintDate: { kind: 'date' },
  secondaryConstraintType: { kind: 'enum' },
  secondaryConstraintDate: { kind: 'date' },
  externalEarlyStart: { kind: 'instant' },
  externalLateFinish: { kind: 'instant' },
  expectedFinish: { kind: 'date' },
  scheduleAsLateAsPossible: { kind: 'boolean' },
  calendarId: { kind: 'reference' },
  levelingPriority: { kind: 'integer' },
  visualStart: { kind: 'date' },
  laneIndex: { kind: 'integer' },
  parentId: { kind: 'reference' },
  percentComplete: { kind: 'integer' },
  actualStart: { kind: 'date' },
  actualFinish: { kind: 'date' },
  remainingDurationMinutes: { kind: 'integer' },
  suspendDate: { kind: 'date' },
  resumeDate: { kind: 'date' },
  physicalPercentComplete: { kind: 'integer' },
  percentCompleteType: { kind: 'enum' },
  accrualType: { kind: 'enum' },
  budgetedExpense: { kind: 'money', cost: true },
  actualExpense: { kind: 'money', cost: true },
} as const satisfies { readonly [K in keyof ActivitySummary]?: FieldSpec };

export type ActivityHistoryFieldKey = keyof typeof ACTIVITY_HISTORY_FIELDS;

/** Prefixes of the keyed-object items; the prefix says which table the id belongs to. */
export const ACTIVITY_HISTORY_KEY_PREFIXES = {
  link: 'link:',
  /** Reserved for cross-plan links, which are recorded from the second milestone (M2-T3). */
  crossPlanLink: 'xlink:',
  assignment: 'assignment:',
} as const;

export type ActivityHistoryItemKind = 'field' | 'link' | 'xlink' | 'assignment';

/** Which family a stored key belongs to. A field key never contains `:`. */
export function activityHistoryItemKind(key: string): ActivityHistoryItemKind {
  if (key.startsWith(ACTIVITY_HISTORY_KEY_PREFIXES.link)) return 'link';
  if (key.startsWith(ACTIVITY_HISTORY_KEY_PREFIXES.crossPlanLink)) return 'xlink';
  if (key.startsWith(ACTIVITY_HISTORY_KEY_PREFIXES.assignment)) return 'assignment';
  return 'field';
}

/** A value of an `ActivityHistoryFieldKind`, as the API sends it. */
export type ActivityHistoryValue = string | number | boolean | null | { id: string; name: string };

/** A field item: `from` / `to` are the values on either side of the change. */
export interface ActivityHistoryFieldChange {
  from: ActivityHistoryValue;
  to: ActivityHistoryValue;
}

/** A description change: only the fact of it. The length and digest never leave the server. */
export interface ActivityHistoryDescriptionChange {
  changed: true;
}

/** What a link's two sides hold. `isDriving` is an engine output and is never recorded. */
export interface ActivityHistoryLinkState {
  type: DependencyType;
  lagMinutes: number;
  lagCalendar: LagCalendarSource;
}

/** The other end of a link, named **as it was when the entry was written**. */
export interface ActivityHistoryLinkEnd {
  id: string;
  code: string | null;
  name: string;
  /** Cross-plan links only: the other end's plan, as it was named then. */
  planId?: string;
  planName?: string;
}

/**
 * A link added (`from: null`), removed (`to: null`) or changed. Recorded on **both** endpoints:
 * `dir` is `IN` when `other` is this activity's predecessor and `OUT` when it is its successor.
 */
export interface ActivityHistoryLinkChange {
  dir: 'IN' | 'OUT';
  other: ActivityHistoryLinkEnd;
  from: ActivityHistoryLinkState | null;
  to: ActivityHistoryLinkState | null;
}

/**
 * Every client-settable input of an assignment. The three quantities are canonical fixed-4 decimal
 * **strings** (`"40.0000"`), because a JSON number cannot carry `DECIMAL(18,4)` exactly; the two
 * money fields are integer minor units and are absent for a reader without `cost:read`.
 */
export interface ActivityHistoryAssignmentState {
  budgetedUnits: string;
  unitsPerHour: string | null;
  actualUnits: string;
  isDriving: boolean;
  curveType: ResourceCurveType;
  lagMinutes: number;
  budgetedCost?: number | null;
  actualCost?: number;
}

/** The resource an assignment names, **as it was when the entry was written**. */
export interface ActivityHistoryResourceRef {
  id: string;
  code: string | null;
  name: string;
}

export interface ActivityHistoryAssignmentChange {
  resource: ActivityHistoryResourceRef;
  from: ActivityHistoryAssignmentState | null;
  to: ActivityHistoryAssignmentState | null;
}

export type ActivityHistoryChange =
  | ActivityHistoryFieldChange
  | ActivityHistoryDescriptionChange
  | ActivityHistoryLinkChange
  | ActivityHistoryAssignmentChange;

export interface ActivityHistoryActor {
  id: string;
  /** Resolved at read time, so an erased user reads as the tombstone (ADR-0085 D1). */
  name: string;
}

export interface ActivityHistoryEntry {
  id: string;
  actor: ActivityHistoryActor;
  scope: ActivityHistoryScope;
  firstRecordedAt: string;
  lastRecordedAt: string;
  /** How many saves this entry absorbed (1 = one save). */
  editCount: number;
  /** Set for a multi-activity write: how many activities the one write recorded. */
  batch: { id: string; size: number } | null;
  origin: ActivityHistoryOrigin | null;
  /** Keyed by item: a field key, `link:<id>` or `assignment:<id>` (`xlink:<id>` is reserved for M2). */
  changes: Record<string, ActivityHistoryChange>;
}

export interface ActivityHistoryPageMeta {
  nextCursor: string | null;
  hasMore: boolean;
  /** The later of the activity's creation and the day the feature started recording. */
  recordingSince: string;
}
