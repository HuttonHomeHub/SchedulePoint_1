import type { NegativeCase, NegativeOutcome } from '@repo/seed';
import { satisfies } from '@repo/seed';

import { SeedHttpError, type SeedClient } from './client.js';
import { PenHolder } from './pen.js';
import { seedPlan, type SeedTarget } from './runner.js';

/**
 * Runs the **negative tier** against a live instance (ADR-0066 M5.1): seed a small valid host plan,
 * make exactly one hostile write, record what the API did.
 *
 * The output is a ledger, not a pass/fail. A case whose observed outcome disagrees with the
 * fixture's declared expectation is a **product finding** — the conformance fixture says a thing must
 * never be schedulable and the application stored it anyway — and the run continues so that one
 * surprise cannot hide the rest. That is the same discipline the rest of the seeder follows and the
 * reason `expect` strings are carried verbatim rather than narrowed to whatever the code does.
 */

export interface NegativeResult {
  id: string;
  expect: string;
  description: string;
  assertion: string | null;
  outcome: NegativeOutcome;
  /** Whether the observed outcome is one the fixture permits. */
  satisfied: boolean;
  /** The API's own machine-readable code when it refused, so a reader can grep for it. */
  code: string | null;
  /** One line of what happened, for the console summary. */
  detail: string;
  /** The host plan, so a surviving case can be opened and looked at. */
  planId: string | null;
}

/** A UUID that is well-formed and belongs to nothing — the "not found", not "malformed", case. */
const ABSENT_ID = '00000000-0000-4000-8000-000000000000';

export async function runNegativeCase(
  client: SeedClient,
  target: SeedTarget,
  negative: NegativeCase,
): Promise<NegativeResult> {
  const base: Omit<NegativeResult, 'outcome' | 'satisfied' | 'code' | 'detail' | 'planId'> = {
    id: negative.id,
    expect: negative.expect,
    description: negative.description,
    assertion: negative.assertion,
  };
  const verdict = (
    outcome: NegativeOutcome,
    detail: string,
    code: string | null,
    planId: string | null,
  ): NegativeResult => ({
    ...base,
    outcome,
    satisfied: satisfies(negative.expect, outcome),
    code,
    detail,
    planId,
  });

  // 1. The host. If this fails the case is INCONCLUSIVE rather than a finding: a hostile write that
  //    never happened proves nothing about the API's willingness to accept it, and reporting it as
  //    a pass or a failure would both be lies.
  const seeded = await seedPlan(client, target, negative.host);
  if (seeded.planId === null) {
    // `alreadyExists` is called out by name because it is the one cause an operator can fix, and
    // the generic message sent a reader looking for an outage the first time it happened.
    const why = seeded.alreadyExists
      ? 'a plan of this name is already in the project — pass a fresh --run-id, or seed into a new project'
      : (seeded.findings[0]?.detail ?? 'the host plan could not be created');
    return verdict('INCONCLUSIVE', `host plan not created: ${why}`, null, null);
  }

  const org = `/api/v1/organizations/${target.orgSlug}`;
  const planPath = `${org}/plans/${seeded.planId}`;

  // 2. Resolve the keys the case names to the ids the host actually got. Read back rather than
  //    threaded out of the seeder: the attempt must point at what is really there.
  const activityIdByCode = new Map<string, string>();
  try {
    const rows = await client.get<{ id: string; code: string }[]>(
      `${planPath}/activities?limit=100`,
    );
    for (const row of rows) activityIdByCode.set(row.code, row.id);
  } catch (error) {
    return verdict(
      'INCONCLUSIVE',
      `could not read the host back: ${message(error)}`,
      null,
      seeded.planId,
    );
  }

  const resourceIdByCode = new Map<string, string>();
  if (negative.attempt.kind === 'assign-resource') {
    try {
      const rows = await client.get<{ id: string; code: string | null }[]>(`${org}/resources`);
      for (const row of rows) if (row.code !== null) resourceIdByCode.set(row.code, row.id);
    } catch (error) {
      return verdict(
        'INCONCLUSIVE',
        `could not read resources: ${message(error)}`,
        null,
        seeded.planId,
      );
    }
  }

  // 3. The single hostile write, under the pen where the endpoint requires it.
  try {
    const detail = await PenHolder.withPen(client, target.orgSlug, seeded.planId, async () =>
      attempt(client, {
        negative,
        org,
        planPath,
        planId: seeded.planId!,
        activityIdByCode,
        resourceIdByCode,
      }),
    );
    return verdict(detail.outcome, detail.detail, null, seeded.planId);
  } catch (error) {
    if (error instanceof SeedHttpError) {
      // A refusal is the expected result for most of these, so it is a verdict rather than a
      // failure. The API's own code is carried through: "the write was refused" is much less
      // useful than "refused with SCHEDULE_GRAPH_NOT_A_DAG naming H1, H2, H3".
      return verdict('REJECTED', error.message, error.code, seeded.planId);
    }
    return verdict('INCONCLUSIVE', message(error), null, seeded.planId);
  }
}

interface AttemptContext {
  negative: NegativeCase;
  org: string;
  planPath: string;
  planId: string;
  activityIdByCode: ReadonlyMap<string, string>;
  resourceIdByCode: ReadonlyMap<string, string>;
}

/**
 * Make the one write. Throws `SeedHttpError` on a refusal — the caller turns that into a verdict.
 *
 * Where the write succeeds, this is where ACCEPTED and REPAIRED are told apart: the response is
 * compared against what was sent, because "the API took it" and "the API took it and changed it"
 * are different answers and several cases (`REJECT_OR_COERCE`, `REPAIR_OR_WARN`) turn on which.
 */
async function attempt(
  client: SeedClient,
  ctx: AttemptContext,
): Promise<{ outcome: NegativeOutcome; detail: string }> {
  const { negative, org, planPath, planId, activityIdByCode, resourceIdByCode } = ctx;

  switch (negative.attempt.kind) {
    case 'create-activity': {
      const body = negative.attempt.body;
      const created = await client.post<Record<string, unknown>>(`${planPath}/activities`, body);
      return compare(body, created, ['durationDays', 'type', 'constraintType', 'constraintDate']);
    }

    case 'create-dependency': {
      const predecessorId = activityIdByCode.get(negative.attempt.predecessorKey);
      const successorId = negative.attempt.danglingSuccessor
        ? ABSENT_ID
        : activityIdByCode.get(negative.attempt.successorKey);
      if (predecessorId === undefined || successorId === undefined) {
        throw new Error('the host did not produce the activities the attempt names');
      }
      const body = { ...negative.attempt.body, predecessorId, successorId };
      const created = await client.post<Record<string, unknown>>(`${planPath}/dependencies`, body);
      return compare(body, created, ['type', 'lagDays']);
    }

    case 'create-calendar': {
      const body = negative.attempt.body;
      const created = await client.post<Record<string, unknown>>(`${org}/calendars`, body);
      return compare(body, created, ['weekdayMask']);
    }

    case 'assign-resource': {
      const activityId = activityIdByCode.get(negative.attempt.activityKey);
      const resourceId = resourceIdByCode.get('NEG-CREW');
      if (activityId === undefined || resourceId === undefined) {
        throw new Error('the host did not produce the activity or resource the attempt names');
      }
      const body = { ...negative.attempt.body, resourceId };
      const created = await client.post<Record<string, unknown>>(
        `${org}/activities/${activityId}/assignments`,
        body,
      );
      return compare(body, created, ['budgetedUnits']);
    }

    case 'set-progress': {
      const activityId = activityIdByCode.get(negative.attempt.activityKey);
      if (activityId === undefined) throw new Error('the host did not produce the activity');
      const row = await client.get<{ version: number }>(`${org}/activities/${activityId}`);
      const body = { ...negative.attempt.body, version: row.version };
      const updated = await client.patch<Record<string, unknown>>(
        `${org}/activities/${activityId}/progress`,
        body,
      );
      return compare(body, updated, [
        'percentComplete',
        'actualStart',
        'actualFinish',
        'remainingDurationDays',
      ]);
    }

    case 'recalculate': {
      // The plan was legal to build; the engine is where the case lives. Surviving the call at all
      // is half the answer — a hang is the failure `REJECT_AT_LOAD_OR_TERMINATE_SAFELY` names — and
      // the flags the engine sets are the other half.
      const result = await client.post<{
        meta?: { warnings?: unknown[] };
        constraintViolationCount?: number;
      }>(`${org}/plans/${planId}/schedule/recalculate`, {});
      const violations = result.constraintViolationCount ?? 0;
      const warnings = result.meta?.warnings?.length ?? 0;
      return {
        outcome: violations > 0 || warnings > 0 ? 'REPAIRED' : 'ACCEPTED',
        detail:
          violations > 0 || warnings > 0
            ? `scheduled and flagged: ${String(violations)} constraint violation(s), ${String(warnings)} warning(s)`
            : 'scheduled with nothing flagged',
      };
    }
  }
}

/**
 * ACCEPTED or REPAIRED, decided by whether the stored row echoes what was sent.
 *
 * Only the fields the case is about are compared. A blanket deep-equal would report every
 * server-assigned id and timestamp as a "repair" and drown the one difference that matters.
 */
function compare(
  sent: Record<string, unknown>,
  stored: Record<string, unknown>,
  fields: readonly string[],
): { outcome: NegativeOutcome; detail: string } {
  const changed = fields
    .filter((field) => field in sent && field in stored)
    .filter((field) => !sameValue(sent[field], stored[field]))
    .map((field) => `${field}: sent ${render(sent[field])}, stored ${render(stored[field])}`);

  if (changed.length === 0) return { outcome: 'ACCEPTED', detail: 'accepted verbatim' };
  return { outcome: 'REPAIRED', detail: `accepted and changed — ${changed.join('; ')}` };
}

/** Dates come back as full instants; the case sent a calendar date. Compare on the date. */
function sameValue(sent: unknown, stored: unknown): boolean {
  if (typeof sent === 'string' && typeof stored === 'string' && /^\d{4}-\d{2}-\d{2}/.test(sent)) {
    return stored.slice(0, 10) === sent.slice(0, 10);
  }
  return sent === stored;
}

function render(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'absent';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value) ?? 'unrenderable';
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A one-screen ledger for the console. The disagreements come last, where a reader stops. */
export function formatNegativeReport(results: readonly NegativeResult[]): string {
  const lines: string[] = ['Negative tier — hostile input, one attempt each (ADR-0066 M5.1)', ''];
  for (const result of results) {
    const mark = result.satisfied ? 'ok     ' : 'FINDING';
    lines.push(`  ${mark} ${result.id.padEnd(34)} expected ${result.expect}`);
    lines.push(`          observed ${result.outcome} — ${result.detail}`);
  }

  const findings = results.filter((result) => !result.satisfied);
  lines.push('');
  if (findings.length === 0) {
    lines.push(
      `  All ${String(results.length)} cases behaved as the conformance fixture requires.`,
    );
    return lines.join('\n');
  }
  lines.push(
    `  ${String(findings.length)} of ${String(results.length)} cases did not. Each is a product`,
    '  finding, not a test to relax: the fixture declares what must never be schedulable, and',
    '  an accepted case means the application stored it anyway.',
    '',
  );
  for (const finding of findings) {
    lines.push(`    ${finding.id}: expected ${finding.expect}, observed ${finding.outcome}`);
    if (finding.assertion !== null) lines.push(`      fixture asks: ${finding.assertion}`);
  }
  return lines.join('\n');
}
