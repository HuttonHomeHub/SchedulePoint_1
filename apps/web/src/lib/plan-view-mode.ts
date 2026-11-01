/**
 * Which projection of the plan the workspace is showing (ADR-0059 §3).
 *
 * The TSLD is lens #1 and stays the default: SchedulePoint's thesis is that the graphical diagram
 * is the primary editing surface, and the Gantt is the alternate projection for the audience that
 * does not read logic diagrams (`PROJECT_BRIEF.md` §1/§8).
 */
export type PlanViewMode = 'tsld' | 'gantt';

/** Every valid view, in the order the switch presents them. TSLD first — it is the default. */
export const PLAN_VIEW_MODES: readonly PlanViewMode[] = ['tsld', 'gantt'];

/** The view a plan opens on when the URL says nothing, or says something we don't recognise. */
export const DEFAULT_PLAN_VIEW_MODE: PlanViewMode = 'tsld';

/** Visible labels for the view switch. Kept beside the type so a new view cannot forget one. */
export const PLAN_VIEW_MODE_LABELS: Record<PlanViewMode, string> = {
  tsld: 'Diagram',
  gantt: 'Gantt',
};

/**
 * Read the view out of a URL search value.
 *
 * Deliberately **total and never throwing**: a hand-edited or stale URL must land the user on a
 * working screen, not an error boundary. Anything unrecognised — a typo, a removed view, an array
 * from a repeated `?view=` param, `undefined` — degrades to {@link DEFAULT_PLAN_VIEW_MODE}. This
 * mirrors how the library screens treat their filter params (ADR-0053 §4).
 *
 * Flag-off, the caller never asks: the Gantt cannot be reached by URL when the feature is off, so
 * `?view=gantt` on a flag-off build resolves to the TSLD like any other unknown value.
 */
export function parsePlanViewMode(value: unknown): PlanViewMode {
  return value === 'gantt' || value === 'tsld' ? value : DEFAULT_PLAN_VIEW_MODE;
}

/**
 * Serialise a view for the URL, omitting the default.
 *
 * The default view produces `{}` rather than `?view=tsld` so the common URL stays clean and a
 * shared link does not pin a choice the user never made — the same reason the library filters
 * only serialise non-default values.
 */
export function planViewModeSearch(view: PlanViewMode): { view?: PlanViewMode } {
  return view === DEFAULT_PLAN_VIEW_MODE ? {} : { view };
}
