/**
 * **The SchedulePoint layout fields in an XER file — the one module that names them**
 * (`docs/specs/layout-interchange/`, §4.4; ADR-0156 draft).
 *
 * A hand-placed start (`visual_start`, ADR-0148) and a row (`lane_index`, ADR-0069) have no P6
 * column, so a SchedulePoint XER carries them as two P6 **user-defined fields** (`UDFTYPE` +
 * `UDFVALUE`). P6 does not schedule from a user-defined field (reasoned from Oracle's documentation,
 * not observed: the spec's FC-6 is recorded unobserved), so the file stays a faithful P6 schedule and
 * a SchedulePoint import can read the picture back.
 *
 * **Identity is the label, matched exactly** — never `udf_type_name` or `udf_type_id`, which are
 * local to one P6 database. A near-miss label is somebody else's field (FC-4). `v1` is the rule, not
 * decoration: it means "the stored `visual_start`, under ADR-0155's end-of-day reading for a finish
 * milestone". A later change to that meaning bumps the version, and this reader reports a newer
 * version rather than misreading it.
 *
 * Every value is attacker-controlled and bounded here: labels are resolved through a `Map`, a date
 * must be a real `YYYY-MM-DD`, a row an integer in `0 … MAX_LAYOUT_LANE`. A value that fails is
 * discarded and **counted** in one finding per kind, never one finding per row.
 */
import type { CanonicalActivity, CanonicalActivityLayout } from './canonical.js';
import type { ReportFinding } from './report.js';
import type { XerDocument } from './xer-parser.js';
import type { XerTableData } from './xer-serialiser.js';

export const LAYOUT_LABEL_PLACED_START = 'SchedulePoint layout v1: placed start';
export const LAYOUT_LABEL_ROW = 'SchedulePoint layout v1: lane';

/**
 * The row ceiling the API already enforces on `laneIndex` (`create-activity.dto.ts`, `@Max(10000)`),
 * and the one `canonicalActivityLayoutSchema` bounds `lane` by.
 */
export const MAX_LAYOUT_LANE = 10_000;

/** What a SchedulePoint file said about one activity's picture. Either half may be absent. */
export type ActivityLayout = CanonicalActivityLayout;

type LayoutField = 'placedStart' | 'lane';
type LayoutTable = 'TASK' | 'PROJWBS';

/** The known labels. A `Map`, so a file-supplied label such as `__proto__` can never match. */
const KNOWN_LABELS: ReadonlyMap<string, LayoutField> = new Map([
  [LAYOUT_LABEL_PLACED_START, 'placedStart'],
  [LAYOUT_LABEL_ROW, 'lane'],
]);

/** A label from SOME version of this contract: `SchedulePoint layout v<n>: …`. */
const VERSIONED_LABEL = /^SchedulePoint layout v(\d+): /;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date in `YYYY-MM-DD` — the `IsCalendarDate` semantics the DTOs use. */
function isCalendarDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (match === null) return false;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return (
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() === Number(m) - 1 &&
    date.getUTCDate() === Number(d)
  );
}

function cell(row: ReadonlyMap<string, string>, name: string): string | undefined {
  const value = row.get(name)?.trim();
  return value === undefined || value === '' ? undefined : value;
}

export interface DecodedLayout {
  /** Keyed by canonical activity id: a TASK's `task_id`, a summary's `wbs:<wbs_id>`. */
  readonly layout: ReadonlyMap<string, ActivityLayout>;
  readonly findings: readonly ReportFinding[];
}

/**
 * Read the layout fields of `projId` out of a parsed XER. `known` holds the file's TASK and PROJWBS
 * ids, so a value pointing at no row is discarded and counted rather than attached to nothing.
 *
 * A file with no `UDFTYPE` table yields an empty map and no findings — the foreign path is unchanged.
 */
export function decodeLayoutFields(
  document: XerDocument,
  projId: string,
  known: { readonly taskIds: ReadonlySet<string>; readonly wbsIds: ReadonlySet<string> },
): DecodedLayout {
  const findings: ReportFinding[] = [];
  const typeRows = document.tables.get('UDFTYPE')?.rows ?? [];
  if (typeRows.length === 0) return { layout: new Map(), findings };

  // --- Which UDFTYPE ids are ours ------------------------------------------------------------------
  const ours = new Map<string, { field: LayoutField; table: LayoutTable }>();
  const claimed = new Set<string>(); // field|table already bound to a type id
  let foreign = 0;
  let newerVersion = 0;
  let duplicateTypes = 0;
  for (const row of typeRows) {
    const label = cell(row, 'udf_type_label');
    const typeId = cell(row, 'udf_type_id');
    const table = cell(row, 'table_name');
    const field = label === undefined ? undefined : KNOWN_LABELS.get(label);
    if (field === undefined || typeId === undefined || (table !== 'TASK' && table !== 'PROJWBS')) {
      const version = label === undefined ? null : VERSIONED_LABEL.exec(label);
      if (version !== null && Number(version[1]) > 1) newerVersion += 1;
      else foreign += 1;
      continue;
    }
    const slot = `${field}|${table}`;
    if (claimed.has(slot)) {
      duplicateTypes += 1;
      continue;
    }
    claimed.add(slot);
    ours.set(typeId, { field, table });
  }

  if (foreign > 0) {
    findings.push({
      kind: 'drop',
      entity: 'project',
      sourceRef: null,
      detail: `${String(foreign)} user-defined field type(s) were not imported`,
      reason: 'user-defined fields are outside the mapping contract (ADR-0050)',
    });
  }
  if (newerVersion > 0) {
    findings.push({
      kind: 'drop',
      entity: 'activity',
      sourceRef: null,
      detail: `${String(newerVersion)} SchedulePoint layout field(s) were written by a newer SchedulePoint and not applied`,
      reason: 'this version reads the v1 layout fields only',
    });
  }
  if (duplicateTypes > 0) {
    findings.push({
      kind: 'repair',
      entity: 'activity',
      sourceRef: null,
      detail: `${String(duplicateTypes)} duplicate SchedulePoint layout field definition(s); the first in the file was used`,
      reason: 'a layout field must be defined once',
    });
  }
  if (ours.size === 0) return { layout: new Map(), findings };

  // --- Their values ---------------------------------------------------------------------------------
  const placed = new Map<string, string>();
  const lanes = new Map<string, number>();
  let orphans = 0;
  let badDates = 0;
  let badLanes = 0;
  let duplicates = 0;
  let summaryPlacements = 0;
  for (const row of document.tables.get('UDFVALUE')?.rows ?? []) {
    const typeId = cell(row, 'udf_type_id');
    const type = typeId === undefined ? undefined : ours.get(typeId);
    if (type === undefined) continue; // a foreign field's value; its type was counted above
    const valueProj = cell(row, 'proj_id');
    if (valueProj !== undefined && valueProj !== projId) continue; // another project in the file
    const fk = cell(row, 'fk_id');
    const exists =
      fk !== undefined && (type.table === 'TASK' ? known.taskIds.has(fk) : known.wbsIds.has(fk));
    if (fk === undefined || !exists) {
      orphans += 1;
      continue;
    }
    const key = type.table === 'TASK' ? fk : `wbs:${fk}`;

    if (type.field === 'placedStart') {
      if (type.table === 'PROJWBS') {
        summaryPlacements += 1; // a summary's dates are a rollup; it is never placed (ADR-0038)
        continue;
      }
      const text = cell(row, 'udf_text');
      if (text === undefined || !isCalendarDate(text)) {
        badDates += 1;
        continue;
      }
      if (placed.has(key)) duplicates += 1;
      else placed.set(key, text);
    } else {
      const raw = cell(row, 'udf_number');
      const lane = raw === undefined ? Number.NaN : Number(raw);
      if (!Number.isInteger(lane) || lane < 0 || lane > MAX_LAYOUT_LANE) {
        badLanes += 1;
        continue;
      }
      if (lanes.has(key)) duplicates += 1;
      else lanes.set(key, lane);
    }
  }

  const discarded = (count: number, detail: string, reason: string): void => {
    if (count > 0) {
      findings.push({
        kind: 'repair',
        entity: 'activity',
        sourceRef: null,
        detail: `${String(count)} ${detail}`,
        reason,
      });
    }
  };
  discarded(
    orphans,
    'layout value(s) named no activity in the file and were discarded',
    'dangling reference',
  );
  discarded(
    badDates,
    'placed start(s) were not a valid date and were discarded',
    'a placed start is a YYYY-MM-DD date',
  );
  discarded(
    badLanes,
    `lane value(s) were not a whole number from 0 to ${String(MAX_LAYOUT_LANE)} and were discarded`,
    'a lane is a whole number',
  );
  discarded(
    duplicates,
    'repeated layout value(s) were discarded; the first in the file was kept',
    'one value per field per activity',
  );
  discarded(
    summaryPlacements,
    'placed start(s) on a WBS summary were discarded',
    'a WBS summary is never hand-placed (ADR-0038)',
  );

  const layout = new Map<string, ActivityLayout>();
  for (const key of new Set([...placed.keys(), ...lanes.keys()])) {
    layout.set(key, { placedStart: placed.get(key) ?? null, lane: lanes.get(key) ?? null });
  }
  return { layout, findings };
}

/** The canonical activity, as far as the encoder needs it: its id, type and layout. */
type Encodable = Pick<CanonicalActivity, 'id' | 'type' | 'layout'>;

const UDFTYPE_FIELDS = [
  'udf_type_id',
  'table_name',
  'udf_type_name',
  'udf_type_label',
  'logical_data_type',
] as const;
const UDFVALUE_FIELDS = [
  'udf_type_id',
  'fk_id',
  'proj_id',
  'udf_date',
  'udf_number',
  'udf_text',
  'udf_code_id',
] as const;

/**
 * The `UDFTYPE` and `UDFVALUE` tables carrying `activities`' layout, or no tables when nothing has a
 * layout. The columns are Oracle's documented subset (spec §0.6); no real P6 file with a UDF was
 * available to copy (M0-T2). A summary gets a row only, never a placement.
 */
export function encodeLayoutFields(
  activities: readonly Encodable[],
  projId: string,
): XerTableData[] {
  const types: Record<string, string>[] = [];
  const values: Record<string, string>[] = [];
  const typeIds = new Map<string, string>();
  const typeId = (label: string, table: LayoutTable, dataType: string): string => {
    const slot = `${label}|${table}`;
    const existing = typeIds.get(slot);
    if (existing !== undefined) return existing;
    const id = String(types.length + 1);
    typeIds.set(slot, id);
    types.push({
      udf_type_id: id,
      table_name: table,
      udf_type_name: `user_field_sp_${id}`,
      udf_type_label: label,
      logical_data_type: dataType,
    });
    return id;
  };

  for (const activity of activities) {
    const layout = activity.layout;
    if (layout === undefined) continue;
    const isSummary = activity.type === 'WBS_SUMMARY';
    const table: LayoutTable = isSummary ? 'PROJWBS' : 'TASK';
    const fk = isSummary ? activity.id.replace(/^wbs:/, '') : activity.id;
    if (layout.placedStart !== null && !isSummary) {
      values.push({
        udf_type_id: typeId(LAYOUT_LABEL_PLACED_START, 'TASK', 'FT_TEXT'),
        fk_id: fk,
        proj_id: projId,
        udf_text: layout.placedStart,
      });
    }
    if (layout.lane !== null) {
      values.push({
        udf_type_id: typeId(LAYOUT_LABEL_ROW, table, 'FT_INT'),
        fk_id: fk,
        proj_id: projId,
        udf_number: String(layout.lane),
      });
    }
  }
  if (values.length === 0) return [];
  return [
    { name: 'UDFTYPE', fields: [...UDFTYPE_FIELDS], rows: types },
    { name: 'UDFVALUE', fields: [...UDFVALUE_FIELDS], rows: values },
  ];
}
