/**
 * **One declared roster of the screens this journey sweeps, replacing four hand-written lists.**
 *
 * `docs/TECH_DEBT.md` #344 was a wrap on the Members screen that survived ADR-0146's eight-milestone
 * gate pass. The cause was not a subtle one: this file carried **four independent per-screen
 * rosters**, written by hand at different times — `{5}`, `{3}`, `{4}`, `{5}` — and `members` was in
 * the two that could never have caught it and absent from the two that would. `recently-deleted`
 * appeared in exactly one; `client-detail`, `project-detail`, `my-activity` and `org-home` in none.
 *
 * So the answer is not "add `members` to a list". It is one declaration that every sweep reads, and
 * a census (`screen-roster.census.test.ts`) asserting it against
 * `apps/web/scripts/measure-column-fit.mjs`'s `PAGES` — the ten screens the measurement harness
 * covers — **in both directions**. A screen the probe measures and the gate never visits is the
 * defect; a screen the gate visits and the probe never measures means the two instruments disagree
 * about what the estate is.
 *
 * **Every exemption is declared with its reason and is asserted, not assumed.** A set derived from
 * the run it is controlling agrees with itself (ADR-0120's A9, whose two sides shared one blind spot
 * and therefore could not disagree).
 *
 * **Scope boundary, stated so "the gate reads the estate" is not over-read:** the estate here is
 * *the probe's* estate. `DataTable` has 23 call sites across 17 files, and `ActivitiesTable`,
 * `DependencyTable`, `BaselinesPanel`, the share dialog, cross-plan links, projects and plans are on
 * none of these ten screens.
 */

/** Which sweep a screen takes part in. A screen may be in some and not others, with a reason. */
export interface ScreenEntry {
  /** The key `measure-column-fit.mjs` uses, so the census can compare the two by name. */
  readonly key: string;
  /** Path under `/orgs/:orgSlug`, or an absolute path for a screen outside the org scope. */
  readonly path: string;
  /**
   * Text that proves the screen's data has SETTLED.
   *
   * `DataTable`'s loading `<thead>` prints no header text and its skeleton is three visible `<tr>`s,
   * so a sweep taken while the query is in flight examines nothing and reports it as nothing wrong.
   * `null` means this screen is not swept for content (see `tables`).
   */
  readonly settled: string | null;
  /** `false` ⇒ the screen renders no `<table>` at all; `reason` says why that is correct. */
  readonly tables: boolean;
  /** Why this screen is absent from a sweep it would otherwise be in. Present ⇒ exempt. */
  readonly exemptReason?: string;
}

export const SCREENS: readonly ScreenEntry[] = [
  {
    key: 'org-home',
    path: '',
    settled: null,
    tables: false,
    exemptReason:
      'the organisation landing is sections and lists, not tables (ADR-0098) — it reports zero ' +
      'tables in docs/specs/page-composition/m2/column-fit-1646.json and that is correct',
  },
  { key: 'clients', path: '/clients', settled: 'Harbourside Estates', tables: true },
  {
    key: 'calendars',
    path: '/calendars',
    settled: '6-Day Construction (10h, Mon-Sat)',
    tables: true,
  },
  { key: 'resources', path: '/resources', settled: 'Hydrotest Pump Unit', tables: true },
  { key: 'members', path: '/members', settled: 'Composition Tester', tables: true },
  { key: 'audit-log', path: '/audit-log', settled: 'Organisation created', tables: true },
  {
    key: 'recently-deleted',
    path: '/recently-deleted',
    settled: 'Throwaway Client',
    tables: true,
  },
  {
    key: 'client-detail',
    path: '/clients/:clientId',
    settled: 'Harbourside Estates',
    tables: true,
  },
  {
    key: 'project-detail',
    path: '/projects/:projectId',
    settled: 'Composition Project',
    tables: true,
  },
  {
    key: 'my-activity',
    path: '/me/activity',
    settled: null,
    tables: true,
    exemptReason:
      'it is not org-scoped — /me/activity sits outside /orgs/:orgSlug, so it has no place in ' +
      'sweeps whose subject is "every screen in this organisation". It is measured by the probe ' +
      'and is deliberately outside the journey, which is a different statement from being missed',
  },
];

/** The screens a content sweep visits: they render tables and carry no exemption. */
export const SWEPT = SCREENS.filter((s) => s.tables && s.exemptReason === undefined);

/** The screens declared out of a content sweep, each carrying its reason. */
export const EXEMPT = SCREENS.filter((s) => s.exemptReason !== undefined);

/** A cell the browser reported as wrapping, with the column declaration that governs it. */
export interface WrapObservation {
  readonly screen: string;
  readonly header: string;
  /** The `data-col-width` the owning cell carries: `fit`, `bounded`, `auto` or `undeclared`. */
  readonly colWidth: string;
  readonly text: string;
}

/**
 * Split observed wraps into the ones a column DECLARED and the ones nobody decided.
 *
 * **This is the gate's whole discriminator, and the obvious alternative is worthless.** Gating on
 * whether the table has spare width is what the old assertion's title and failure message both
 * advertised — and measured, **zero of the nine wraps in the estate sit in a table with positive
 * slack** (`docs/specs/table-wrap-coverage/m0/README.md` §2). A slack rule fires on nothing at all:
 * it excuses the audit log's three deliberate `auto` columns and Members' five undeclared ones
 * alike, and could never fail.
 *
 * `auto` means somebody wrote down that this column may wrap and why. `undeclared` means the column
 * never mentioned `width`, which is ADR-0146 D3's rule ("`auto` must be written down") turned from
 * prose into something an instrument can read.
 *
 * Pure, and separated from the `page.evaluate` that produces its input, so it can be tested without
 * a browser — `stack-record.structural.test.ts` is the recorded cost of asserting against a private
 * mirror of logic instead of the logic itself.
 */
export function partitionWraps(observed: readonly WrapObservation[]): {
  findings: WrapObservation[];
  tolerated: WrapObservation[];
} {
  const findings: WrapObservation[] = [];
  const tolerated: WrapObservation[] = [];
  for (const wrap of observed) (wrap.colWidth === 'auto' ? tolerated : findings).push(wrap);
  return { findings, tolerated };
}
