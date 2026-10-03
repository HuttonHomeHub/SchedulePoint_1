import {
  activityHistoryItemKind,
  ACTIVITY_HISTORY_FIELDS,
  type ActivityHistoryAssignmentChange,
  type ActivityHistoryAssignmentState,
  type ActivityHistoryChange,
  type ActivityHistoryFieldChange,
  type ActivityHistoryFieldKey,
  type ActivityHistoryLinkChange,
  type ActivityHistoryLinkEnd,
  type ActivityHistoryLinkState,
  type ActivityHistoryValue,
} from '@repo/types';

import {
  ACCRUAL_TYPE_LABELS,
  ACTIVITY_TYPE_LABELS,
  CONSTRAINT_TYPE_LABELS,
  DURATION_TYPE_LABELS,
  PERCENT_COMPLETE_TYPE_LABELS,
} from '@/features/activities';
import { DEPENDENCY_TYPE_LABELS } from '@/features/dependencies';
import { RESOURCE_CURVE_LABELS } from '@/features/resources';
import { formatDurationText, formatWorkingMinutesNoDays } from '@/lib/duration-text';
import { formatCalendarDate } from '@/lib/format-date';
import { formatMoney } from '@/lib/format-money';

/**
 * **One sentence per recorded item** (ADR-0174). Pure, so every key and every link / assignment shape
 * is a table test rather than a mounted timeline.
 *
 * It reuses the formatters the editor already shows a value with — duration text, calendar dates,
 * money, the type labels — and does not format a value a second way (R8): two spellings of "5 d"
 * drift, and the drift is invisible because each screen looks right alone.
 */
export interface HistoryFormatContext {
  /**
   * Working hours in the activity's day (ADR-0068). Without it a duration reads in hours and minutes,
   * the one unit that needs no calendar — never a guessed day length.
   */
  hoursPerDay: number | undefined;
  /** The plan's currency, for the money items a cost reader sees. */
  currencyCode: string | null;
}

export interface HistoryLine {
  /** The sentence, e.g. `Duration 5d → 9d` or `Link added: FS from 1020 Steel erection`. */
  text: string;
}

/** Labels for every recorded field. Exhaustive, so a key added to the vocabulary must be named here. */
const FIELD_LABELS: Record<ActivityHistoryFieldKey, string> = {
  name: 'Name',
  code: 'Code',
  description: 'Description',
  type: 'Type',
  durationMinutes: 'Duration',
  durationType: 'Duration type',
  constraintType: 'Constraint',
  constraintDate: 'Constraint date',
  secondaryConstraintType: 'Secondary constraint',
  secondaryConstraintDate: 'Secondary constraint date',
  externalEarlyStart: 'External early start',
  externalLateFinish: 'External late finish',
  expectedFinish: 'Expected finish',
  scheduleAsLateAsPossible: 'As late as possible',
  calendarId: 'Calendar',
  levelingPriority: 'Levelling priority',
  visualStart: 'Placed start',
  laneIndex: 'Lane',
  parentId: 'WBS parent',
  percentComplete: '% complete',
  actualStart: 'Actual start',
  actualFinish: 'Actual finish',
  remainingDurationMinutes: 'Remaining duration',
  suspendDate: 'Suspend date',
  resumeDate: 'Resume date',
  physicalPercentComplete: 'Physical % complete',
  percentCompleteType: '% complete type',
  accrualType: 'Cost accrual',
  budgetedExpense: 'Budgeted expense',
  actualExpense: 'Actual expense',
};

const NONE = 'none';

function minutesText(minutes: number, hoursPerDay: number | undefined): string {
  return hoursPerDay === undefined
    ? formatWorkingMinutesNoDays(minutes)
    : formatDurationText(minutes, hoursPerDay);
}

/** An instant: the day, plus the time only when it is not midnight UTC (the two external dates). */
function instantText(iso: string): string {
  const time = iso.slice(11, 16);
  const day = formatCalendarDate(iso.slice(0, 10));
  return time === '00:00' ? day : `${day} ${time} UTC`;
}

function enumText(key: ActivityHistoryFieldKey, value: string): string {
  switch (key) {
    case 'type':
      return (ACTIVITY_TYPE_LABELS as Record<string, string>)[value] ?? value;
    case 'durationType':
      return (DURATION_TYPE_LABELS as Record<string, string>)[value] ?? value;
    case 'constraintType':
    case 'secondaryConstraintType':
      return (CONSTRAINT_TYPE_LABELS as Record<string, string>)[value] ?? value;
    case 'percentCompleteType':
      return (
        PERCENT_COMPLETE_TYPE_LABELS[value as keyof typeof PERCENT_COMPLETE_TYPE_LABELS]?.label ??
        value
      );
    case 'accrualType':
      return (ACCRUAL_TYPE_LABELS as Record<string, string>)[value] ?? value;
    default:
      return value;
  }
}

/** A stored scalar as text. An object here would be a vocabulary bug, so it reads as empty, not `[object Object]`. */
function scalarText(value: ActivityHistoryValue): string {
  return value === null || typeof value === 'object' ? '' : String(value);
}

function fieldValueText(
  key: ActivityHistoryFieldKey,
  value: ActivityHistoryValue,
  ctx: HistoryFormatContext,
): string {
  if (value === null) return NONE;
  const { kind } = ACTIVITY_HISTORY_FIELDS[key];
  switch (kind) {
    case 'reference':
      return (value as { name: string }).name || 'unnamed';
    case 'date':
      return formatCalendarDate(value as string);
    case 'instant':
      return instantText(value as string);
    case 'money':
      return formatMoney(value as number, ctx.currencyCode);
    case 'boolean':
      return value === true ? 'on' : 'off';
    case 'enum':
      return enumText(key, value as string);
    case 'integer':
      if (key === 'durationMinutes' || key === 'remainingDurationMinutes') {
        return minutesText(value as number, ctx.hoursPerDay);
      }
      return key === 'percentComplete' || key === 'physicalPercentComplete'
        ? `${scalarText(value)}%`
        : scalarText(value);
    default:
      return scalarText(value);
  }
}

/** A signed lag the way the Logic tab prints one: `0d`, `+2d`, `−4h`. */
function lagText(minutes: number, hoursPerDay: number | undefined): string {
  if (minutes === 0) return '0d';
  const magnitude = minutesText(Math.abs(minutes), hoursPerDay);
  return minutes > 0 ? `+${magnitude}` : `−${magnitude}`;
}

function linkStateText(state: ActivityHistoryLinkState, ctx: HistoryFormatContext): string {
  return `${state.type} ${lagText(state.lagMinutes, ctx.hoursPerDay)}`;
}

/** The other end as it was named when recorded: `1020 Steel erection`. */
function endText(end: ActivityHistoryLinkEnd): string {
  const base = end.code ? `${end.code} ${end.name}` : end.name;
  return end.planName ? `${base} (${end.planName})` : base;
}

function linkLine(change: ActivityHistoryLinkChange, ctx: HistoryFormatContext): string {
  const direction = change.dir === 'IN' ? 'from' : 'to';
  const other = `${direction} ${endText(change.other)}`;
  if (change.from === null && change.to !== null) {
    return `Link added: ${linkStateText(change.to, ctx)} ${other}`;
  }
  if (change.to === null && change.from !== null) {
    return `Link removed: ${linkStateText(change.from, ctx)} ${other}`;
  }
  if (change.from !== null && change.to !== null) {
    const parts: string[] = [];
    if (change.from.type !== change.to.type) {
      parts.push(
        `${DEPENDENCY_TYPE_LABELS[change.from.type]} → ${DEPENDENCY_TYPE_LABELS[change.to.type]}`,
      );
    }
    if (change.from.lagMinutes !== change.to.lagMinutes) {
      parts.push(
        `lag ${lagText(change.from.lagMinutes, ctx.hoursPerDay)} → ${lagText(change.to.lagMinutes, ctx.hoursPerDay)}`,
      );
    }
    if (change.from.lagCalendar !== change.to.lagCalendar) parts.push('lag calendar changed');
    return `Link changed: ${parts.join(', ')} ${other}`;
  }
  return `Link: ${other}`;
}

/** `40.0000` → `40`, `2.5000` → `2.5`: the canonical fixed-4 string without its padding. */
function decimalText(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value;
}

function quantityText(state: ActivityHistoryAssignmentState): string {
  return `${decimalText(state.budgetedUnits)} units`;
}

function assignmentLine(
  change: ActivityHistoryAssignmentChange,
  ctx: HistoryFormatContext,
): string {
  const name = change.resource.name;
  if (change.from === null && change.to !== null) {
    return `Resource added: ${name} — ${quantityText(change.to)}${change.to.isDriving ? ', driving' : ''}`;
  }
  if (change.to === null && change.from !== null) return `Resource removed: ${name}`;
  if (change.from === null || change.to === null) return `Resource: ${name}`;

  const { from, to } = change;
  const parts: string[] = [];
  if (from.budgetedUnits !== to.budgetedUnits) {
    parts.push(`units ${decimalText(from.budgetedUnits)} → ${decimalText(to.budgetedUnits)}`);
  }
  if (from.unitsPerHour !== to.unitsPerHour) {
    const text = (v: string | null) => (v === null ? NONE : decimalText(v));
    parts.push(`units per hour ${text(from.unitsPerHour)} → ${text(to.unitsPerHour)}`);
  }
  if (from.actualUnits !== to.actualUnits) {
    parts.push(`actual units ${decimalText(from.actualUnits)} → ${decimalText(to.actualUnits)}`);
  }
  if (from.isDriving !== to.isDriving)
    parts.push(to.isDriving ? 'now driving' : 'no longer driving');
  if (from.curveType !== to.curveType) {
    parts.push(
      `curve ${RESOURCE_CURVE_LABELS[from.curveType]} → ${RESOURCE_CURVE_LABELS[to.curveType]}`,
    );
  }
  if (from.lagMinutes !== to.lagMinutes) {
    parts.push(
      `start delay ${minutesText(from.lagMinutes, ctx.hoursPerDay)} → ${minutesText(to.lagMinutes, ctx.hoursPerDay)}`,
    );
  }
  // Money is absent for a reader without `cost:read`, so a difference here is only ever shown to one
  // who may see it.
  if (from.budgetedCost !== undefined && from.budgetedCost !== to.budgetedCost) {
    const text = (v: number | null | undefined) => formatMoney(v ?? null, ctx.currencyCode);
    parts.push(`budgeted cost ${text(from.budgetedCost)} → ${text(to.budgetedCost)}`);
  }
  if (from.actualCost !== undefined && from.actualCost !== to.actualCost) {
    parts.push(
      `actual cost ${formatMoney(from.actualCost, ctx.currencyCode)} → ${formatMoney(to.actualCost ?? null, ctx.currencyCode)}`,
    );
  }
  return `Resource changed: ${name} — ${parts.join('; ')}`;
}

/**
 * The sentence for one stored item. `key` is the stored key (a field name, `link:<id>`, `xlink:<id>`
 * or `assignment:<id>`); a key this build does not know is shown by name rather than dropped, so a
 * newer server's item is visible rather than silently missing from a timeline.
 */
export function formatHistoryItem(
  key: string,
  change: ActivityHistoryChange,
  ctx: HistoryFormatContext,
): HistoryLine {
  switch (activityHistoryItemKind(key)) {
    case 'link':
    case 'xlink':
      return { text: linkLine(change as ActivityHistoryLinkChange, ctx) };
    case 'assignment':
      return { text: assignmentLine(change as ActivityHistoryAssignmentChange, ctx) };
    case 'field': {
      if (!(key in ACTIVITY_HISTORY_FIELDS)) return { text: `${key} changed` };
      const field = key as ActivityHistoryFieldKey;
      if ('changed' in change) return { text: `${FIELD_LABELS[field]} changed` };
      const { from, to } = change as ActivityHistoryFieldChange;
      return {
        text: `${FIELD_LABELS[field]} ${fieldValueText(field, from, ctx)} → ${fieldValueText(field, to, ctx)}`,
      };
    }
  }
}

/** Every item of one entry, in the vocabulary's field order and then links and resources. */
export function formatHistoryEntry(
  changes: Record<string, ActivityHistoryChange>,
  ctx: HistoryFormatContext,
): HistoryLine[] {
  const fieldOrder = Object.keys(ACTIVITY_HISTORY_FIELDS);
  const rank = (key: string): number => {
    const index = fieldOrder.indexOf(key);
    return index === -1 ? fieldOrder.length : index;
  };
  return Object.keys(changes)
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((key) => formatHistoryItem(key, changes[key] as ActivityHistoryChange, ctx));
}
