import type { SeedSpec } from '../spec.js';

/**
 * The **negative tier** (ADR-0066 M5.1): hostile input, one attempt each, against the real API.
 *
 * ## Why this tier is shaped differently from the other four
 *
 * Every other tier describes a plan the product *should* accept and asserts the dates that come
 * back. This one describes a write the product *should refuse*, and the interesting output is not a
 * date — it is **what the API did**. So a case is two things: a small **valid host plan** to make
 * the attempt against, and exactly **one** hostile write.
 *
 * One attempt, deliberately. A hostile case that made three writes could not say which one the
 * refusal belonged to, and a refusal that stops the run would hide every case after it.
 *
 * ## The rule that makes this tier worth having
 *
 * **A case the API accepts is a finding, not a test to relax.** `negative_cases.json` is the
 * conformance fixture's declaration of what must never be schedulable (ADR-0034 §4: reject, repair
 * or report — never hang, crash, or silently produce nonsense). The engine's half is already
 * asserted in `apps/api/src/modules/schedule/conformance/negative.spec.ts`, and that file marks
 * **three cases `todo` because they are API-boundary concerns the pure engine cannot own** (N09
 * negative duration, N17 milestone-with-duration, N26). This tier is where those get an answer —
 * and the answer is measured, not assumed.
 *
 * So the runner records the **observed** outcome against the **declared** expectation and reports
 * the disagreement. It does not fail the process: a run exists to produce the list, and exiting on
 * the first surprise would stop a reader exactly where there is something to read.
 */

/**
 * The fixture's own `expect` vocabulary, carried verbatim rather than reinterpreted.
 *
 * Several of these are deliberately permissive — `REJECT_OR_WARN`, `REPAIR_OR_WARN`,
 * `REJECT_OR_DEDUPE` — because the fixture is a **north star, not a parity target** (ADR-0034), and
 * it leaves the product room to choose. Narrowing them here to whatever the code happens to do is
 * exactly the drift ADR-0058 exists to stop, so the string stays as written and the report says
 * which of the permitted behaviours was observed.
 */
export const NEGATIVE_EXPECTATIONS = [
  'REJECT',
  'REJECT_WITH_CYCLE_REPORT',
  'REJECT_OR_DEDUPE',
  'REJECT_OR_WARN',
  'REJECT_OR_COERCE',
  'REJECT_AT_LOAD_OR_TERMINATE_SAFELY',
  'REPAIR_OR_WARN',
  'SCHEDULE_AND_REPORT_VIOLATION',
  'CLAMP_TO_DATA_DATE',
  'WARN',
] as const;
export type NegativeExpectation = (typeof NEGATIVE_EXPECTATIONS)[number];

/**
 * The one hostile write, described without knowing any database id.
 *
 * Keys are resolved to ids by the runner from the host plan it has just created, which is what lets
 * a case be declared in a pure package and executed against a live server.
 */
export type NegativeAttempt =
  /** `POST …/plans/:id/activities` — a body the DTO should refuse. */
  | { kind: 'create-activity'; body: Record<string, unknown> }
  /** `POST …/plans/:id/dependencies` between two host activities (or a deliberately absent one). */
  | {
      kind: 'create-dependency';
      predecessorKey: string;
      successorKey: string;
      /** Not a host activity: the runner sends a well-formed id that resolves to nothing. */
      danglingSuccessor?: boolean;
      body: Record<string, unknown>;
    }
  /** `POST …/organizations/:slug/calendars` — e.g. the zero-working-time calendar, N11. */
  | { kind: 'create-calendar'; body: Record<string, unknown> }
  /** `POST …/activities/:id/assignments` — e.g. negative budgeted units, N14. */
  | {
      kind: 'assign-resource';
      activityKey: string;
      resourceKey: string;
      body: Record<string, unknown>;
    }
  /** `PATCH …/activities/:id/progress` — the actual-date and remaining-duration cases. */
  | { kind: 'set-progress'; activityKey: string; body: Record<string, unknown> }
  /**
   * `POST …/plans/:id/schedule/recalculate` after the host has been seeded into a state the engine
   * must survive. The cases where the *plan* is legal to build and the *schedule* is the hostile
   * part (an impossible mandatory pair, an unschedulable calendar) can only be tested this way.
   */
  | { kind: 'recalculate' };

export interface NegativeCase {
  /** The fixture's id, so a reader can find the source case. */
  id: string;
  expect: NegativeExpectation;
  description: string;
  /**
   * What the fixture says a correct implementation must demonstrate, where it says anything. Carried
   * so the report can print it beside the observed outcome — several cases are only meaningful with
   * it (N01 asks for the cycle's *members*, not merely "a loop exists").
   */
  assertion: string | null;
  /** A valid plan to attempt the hostile write against. Seeded by the ordinary seeder. */
  host: SeedSpec;
  attempt: NegativeAttempt;
}

/** What the API actually did, which is the whole output of this tier. */
export type NegativeOutcome =
  /** The write was refused. The expected result for most cases. */
  | 'REJECTED'
  /** The write succeeded and the stored value differs from what was sent — a repair. */
  | 'REPAIRED'
  /** The write succeeded verbatim. For a `REJECT` case this is a product finding. */
  | 'ACCEPTED'
  /** The call failed for a reason unrelated to the case (host setup, network). Not a verdict. */
  | 'INCONCLUSIVE';

/**
 * Does the observed outcome satisfy the declared expectation?
 *
 * The permissive expectations are permissive here too — `REJECT_OR_WARN` is met by a rejection *or*
 * by an accepted-and-flagged write, because the fixture deliberately allows both. What is never
 * acceptable is `ACCEPTED` against a bare `REJECT`: that is the product storing something the
 * conformance fixture says must never exist.
 */
export function satisfies(expect: NegativeExpectation, outcome: NegativeOutcome): boolean {
  if (outcome === 'INCONCLUSIVE') return false;
  switch (expect) {
    case 'REJECT':
    case 'REJECT_WITH_CYCLE_REPORT':
      return outcome === 'REJECTED';
    case 'REJECT_OR_DEDUPE':
    case 'REJECT_OR_COERCE':
      return outcome === 'REJECTED' || outcome === 'REPAIRED';
    case 'REJECT_AT_LOAD_OR_TERMINATE_SAFELY':
      // "Terminates safely" includes scheduling it and saying so. Any settled outcome satisfies it:
      // the one unacceptable answer is a HANG, which never reaches this function at all — the
      // runner's timeout is what tests for that, not a comparison here.
      return true;
    case 'REJECT_OR_WARN':
    case 'REPAIR_OR_WARN':
    case 'WARN':
    case 'SCHEDULE_AND_REPORT_VIOLATION':
    case 'CLAMP_TO_DATA_DATE':
      // These permit the write, so any settled outcome satisfies them. Whether the *warning* was
      // actually raised is a claim this tier cannot make from the HTTP response alone — it is
      // recorded as observed and left to the playbook, rather than asserted with a check that
      // could only ever pass.
      return true;
  }
}
