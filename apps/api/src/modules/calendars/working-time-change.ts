import type { UpdateCalendarDto } from './dto/update-calendar.dto';

/**
 * Which kind of working time an edit touched (ADR-0073 family E).
 *
 * Three values and no more, because the audit row's job is to say **that** the calendar's working
 * time changed and roughly what kind — not to carry a diff. The shift rows and window lists are
 * not scalar and would be reduced to a type marker by the redactor anyway; more to the point, a
 * reader arriving at this row is asking "why did every date on my plan move overnight?", and a
 * JSON dump of seven days' windows buries the answer rather than giving it.
 */
export type WorkingTimeChangeKind = 'shifts' | 'hoursPerDay' | 'exception';

/**
 * Classify a calendar PATCH, or `null` when it changed no working time at all.
 *
 * `null` is the common case and the important one: a rename, a description edit or a scope move
 * writes no `calendar.working_time_changed` row, because none of them changes a single date.
 *
 * The weekly mask and the intraday shift patterns both report `shifts` — they are two encodings of
 * the same fact (which hours are worked in a normal week), and splitting them would ask a reader
 * to know which control the planner happened to use. `hoursPerDay` is separate because it is a
 * genuinely different quantity: after ADR-0068 it is the day↔minute factor, so moving it
 * reinterprets every duration on the calendar **without** changing when anybody works.
 *
 * Keyed on **presence in the DTO**, not on a value diff, and that is the honest reading here: a
 * calendar's shift set is a collection, `PATCH` replaces it wholesale, and "you sent a working
 * week" is what the caller asserted. The plan-settings producer diffs by value instead, because
 * its client resends the whole form; this one's does not.
 */
export function workingTimeChangeKind(dto: UpdateCalendarDto): WorkingTimeChangeKind | null {
  if (dto.workingWeekdays !== undefined || dto.shifts !== undefined) return 'shifts';
  if (dto.hoursPerDay !== undefined) return 'hoursPerDay';
  return null;
}
