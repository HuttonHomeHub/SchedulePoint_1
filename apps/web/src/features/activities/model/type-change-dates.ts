import type { ActivityType } from '@repo/types';

/**
 * **Whether saving this type will make the server re-express the activity's stored dates**
 * (ADR-0162 decision 3, `docs/specs/zero-duration-task/` M2-T2).
 *
 * The server moves each stored, unsent date one calendar day when a zero-duration activity's type
 * changes into or out of `FINISH_MILESTONE`, because a finish milestone reads a date as the END of
 * its day and every other type as the start. This predicate mirrors the server's condition so the
 * editor can say so before the save. It keys on the **stored** type and duration, as the server
 * does: the selection the reader has not saved yet is only the "to" side.
 *
 * It never computes the moved dates: the server is the one place that does (spec, "Validation
 * rules"), and the editor re-seeds its Scheduling tab from the saved row instead.
 */
export function typeChangeReexpressesDates(
  savedType: ActivityType | undefined,
  savedDurationMinutes: number | undefined,
  selectedType: ActivityType,
): boolean {
  if (savedType === undefined || savedDurationMinutes !== 0) return false;
  if (selectedType === savedType) return false;
  return (savedType === 'FINISH_MILESTONE') !== (selectedType === 'FINISH_MILESTONE');
}

/** The hint under the Type field when {@link typeChangeReexpressesDates} holds. */
export const TYPE_CHANGE_DATES_HINT =
  'Its dates will be re-expressed so it keeps the same point in the schedule; its successors and ' +
  'float are unchanged. A finish milestone reads its dates as the end of the day and is drawn ' +
  'there. Dates you save afterwards on the Scheduling tab are read the new way.';
