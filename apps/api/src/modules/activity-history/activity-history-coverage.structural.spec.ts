import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **The coverage census** (ADR-0174 D9) — every code path that writes an activity's input columns, a
 * link or a resource assignment is either **recorded** in the activity's history, **pending** (a
 * snapshot queue the second milestone empties; the ADR-0073 `PENDING_COVERAGE` precedent), or
 * **exempt with a reason**, and the two sets together are exactly the writes that exist.
 *
 * **Why it exists.** A write that should record and does not looks identical to one where nothing
 * happened: the timeline simply has a gap nobody can see. No test of any recorder can catch a path
 * nobody wired, because there is nothing to assert against. Only a census that fails when a write
 * appears in neither list turns "does this record?" into a decision somebody makes.
 *
 * **The writes are found by reading the source**, not from a hand-written list: every
 * `<model>.create | createMany | update | updateMany | upsert | delete | deleteMany` on the four
 * models, and every raw `UPDATE | INSERT INTO | DELETE FROM` on their tables, outside specs and the
 * CPM engine's directory (which only ever sees inputs and writes outputs). A site is keyed by file,
 * enclosing method and operation, so a second write added inside an already-listed method is a new,
 * undecided site.
 *
 * **A `recorded` claim is checked, not trusted:** each names the method(s) that record it, and the
 * census fails unless that method's body calls the recorder. Verified against a deliberately
 * unwired path (ADR-0110): deleting the `history.record` call from `DependenciesService.update`
 * fails the second assertion, and adding an unlisted write fails the first.
 */

const SRC = join(__dirname, '..', '..');

type Status = 'recorded' | 'pending-m2' | 'exempt';

interface Site {
  status: Status;
  reason: string;
  /** `file::method` of each method whose body must call the recorder. Required for `recorded`. */
  recordedBy?: readonly string[];
}

const ACTIVITIES = 'modules/activities/activities.service.ts';
const DEPENDENCIES = 'modules/dependencies/dependencies.service.ts';
const ASSIGNMENTS = 'modules/resources/resource-assignment.service.ts';

const SITES: Record<string, Site> = {
  // — activities: the activity's own inputs ——————————————————————————————————————————————
  'modules/activities/activity.repository.ts::updateIfVersionMatches::activity.updateMany': {
    status: 'recorded',
    reason: 'The version-gated single-activity write: the editor, Gantt cells, single-bar drags.',
    recordedBy: [`${ACTIVITIES}::update`, `${ACTIVITIES}::updateProgress`],
  },
  'modules/activities/activity.repository.ts::updateLanePositions::activities.UPDATE': {
    status: 'exempt',
    reason: 'Lane only: the diagram auto-packs lanes without the planner deciding anything (CQ-4).',
  },
  'modules/activities/activity.repository.ts::updatePlacements::activities.UPDATE': {
    status: 'pending-m2',
    reason: 'Batch placement: one entry per activity, scope PLACEMENT, never merging (M2-T2).',
  },
  'modules/activities/activity.repository.ts::updateParents::activities.UPDATE': {
    status: 'pending-m2',
    reason: 'Batch re-parent: scope PLACEMENT (M2-T2).',
  },
  'modules/activities/activity.repository.ts::create::activity.create': {
    status: 'exempt',
    reason: "A create is shown from the activity's own created_by / created_at, not as an entry.",
  },
  'modules/activities/activity.repository.ts::createMany::activity.createMany': {
    status: 'exempt',
    reason:
      'Import and paste create activities; the activity is born with its links and assignments.',
  },
  'modules/activities/activities.service.ts::recomputeDrivingAssignmentOnDurationEdit::resourceAssignment.updateMany':
    {
      status: 'recorded',
      reason:
        'A duration edit rewrites the driving assignment in the same write: the item rides in the ' +
        'DEFINITION entry (data-model §9 item 15).',
      recordedBy: [`${ACTIVITIES}::update`],
    },
  'modules/activities/activities.service.ts::dissolveSummary::activity.updateMany': {
    status: 'pending-m2',
    reason: 'Dissolve re-parents the children: scope PLACEMENT, origin SUMMARY_DISSOLVED (M2-T2).',
  },
  'modules/activities/activity-steps.service.ts::replace::activity.updateMany': {
    status: 'exempt',
    reason: 'A version bump only; weighted steps are not recorded in the first release.',
  },
  // — links ————————————————————————————————————————————————————————————————————————————————
  'modules/dependencies/dependency.repository.ts::create::activityDependency.create': {
    status: 'recorded',
    reason: 'A single link create, recorded on both endpoints.',
    recordedBy: [`${DEPENDENCIES}::create`],
  },
  'modules/dependencies/dependency.repository.ts::createMany::activityDependency.createMany': {
    status: 'exempt',
    reason: 'Import creates links together with the activities they join.',
  },
  'modules/dependencies/dependency.repository.ts::updateIfVersionMatches::activityDependency.updateMany':
    {
      status: 'recorded',
      reason: 'A link type / lag edit, recorded on both endpoints.',
      recordedBy: [`${DEPENDENCIES}::update`],
    },
  'modules/cross-plan-dependencies/cross-plan-dependency.repository.ts::create::crossPlanDependency.create':
    {
      status: 'pending-m2',
      reason: 'Cross-plan link create, on both endpoints in their own plans (M2-T3).',
    },
  'modules/cross-plan-dependencies/cross-plan-dependency.repository.ts::softDelete::crossPlanDependency.updateMany':
    {
      status: 'pending-m2',
      reason: 'Cross-plan link delete, on both endpoints (M2-T3).',
    },
  'common/hierarchy/hierarchy-lifecycle.service.ts::cascadeSoftDelete::activityDependency.updateMany':
    {
      status: 'pending-m2',
      reason:
        'Deleting an activity removes its links to surviving activities: a knock-on entry on each ' +
        'survivor (M2-T4). The directly-deleted link branch of the same method is recorded by ' +
        'DependenciesService.remove, which calls it.',
    },
  'common/hierarchy/hierarchy-lifecycle.service.ts::cascadeSoftDelete::activity.updateMany': {
    status: 'exempt',
    reason:
      'Delete of the subject itself: in the audit log, and a deleted activity cannot be opened.',
  },
  'common/hierarchy/hierarchy-lifecycle.service.ts::cascadeSoftDeleteActivityLeaves::activityDependency.updateMany':
    {
      status: 'pending-m2',
      reason: 'Bulk delete removes links to survivors: a knock-on entry on each (M2-T4).',
    },
  'common/hierarchy/hierarchy-lifecycle.service.ts::cascadeSoftDeleteActivityLeaves::activity.updateMany':
    {
      status: 'exempt',
      reason: 'Bulk delete of the subjects themselves: in the audit log.',
    },
  'common/hierarchy/hierarchy-lifecycle.service.ts::restoreBatch::activity.updateMany': {
    status: 'exempt',
    reason: 'Restore of the subjects themselves: in the audit log.',
  },
  'common/hierarchy/hierarchy-lifecycle.service.ts::restoreBatch::activity.update': {
    status: 'exempt',
    reason: 'Restore of the subject itself: in the audit log.',
  },
  'common/hierarchy/hierarchy-lifecycle.service.ts::restoreBatch::activityDependency.update': {
    status: 'exempt',
    reason:
      'The defensive branch for a row with no batch id, which no delete produces ' +
      '("a soft-deleted row should always carry a batch id", in that method).',
  },
  'common/hierarchy/hierarchy-lifecycle.service.ts::restoreLinksInBatch::activityDependency.updateMany':
    {
      status: 'pending-m2',
      reason:
        'Restoring an activity brings its links back: a knock-on entry on each survivor (M2-T4).',
    },
  // — resource assignments ——————————————————————————————————————————————————————————————
  'modules/resources/resource-assignment.repository.ts::create::resourceAssignment.create': {
    status: 'recorded',
    reason: 'An assignment create, with the duration the units triad may rewrite.',
    recordedBy: [`${ASSIGNMENTS}::create`],
  },
  'modules/resources/resource-assignment.repository.ts::createManyForImport::resourceAssignment.createMany':
    {
      status: 'exempt',
      reason: 'Import creates assignments together with the activities they belong to.',
    },
  'modules/resources/resource-assignment.repository.ts::clearDrivingForActivity::resource_assignments.UPDATE':
    {
      status: 'recorded',
      reason: 'Setting a driver displaces the previous one; both are items of the one entry.',
      recordedBy: [`${ASSIGNMENTS}::create`, `${ASSIGNMENTS}::update`],
    },
  'modules/resources/resource-assignment.repository.ts::updateIfVersionMatches::resourceAssignment.updateMany':
    {
      status: 'recorded',
      reason: 'An assignment edit.',
      recordedBy: [`${ASSIGNMENTS}::update`],
    },
  'modules/resources/resource-assignment.repository.ts::softDelete::resourceAssignment.updateMany':
    {
      status: 'recorded',
      reason: 'An unassign, recorded only by the transaction that made the transition.',
      recordedBy: [`${ASSIGNMENTS}::remove`],
    },
  'modules/resources/resource-assignment.service.ts::persistActivityDuration::activity.updateMany':
    {
      status: 'recorded',
      reason: 'The duration the units triad derives, recorded in the same RESOURCES entry.',
      recordedBy: [`${ASSIGNMENTS}::create`, `${ASSIGNMENTS}::update`],
    },
  // — written by something other than a person —————————————————————————————————————————————
  'modules/schedule/schedule.repository.ts::writeResults::activities.UPDATE': {
    status: 'exempt',
    reason: "The engine writes calculated dates and flags: outputs, never a person's change.",
  },
  'modules/schedule/schedule.repository.ts::writeDrivingFlags::dependencies.UPDATE': {
    status: 'exempt',
    reason: "A link's is_driving is an engine output and is never recorded.",
  },
  // — permanent deletion ——————————————————————————————————————————————————————————————————
  'modules/interchange/interchange.service.ts::compensate::resourceAssignment.deleteMany': {
    status: 'exempt',
    reason: "A failed import's rollback of rows it created; history for them is deleted first.",
  },
  'modules/interchange/interchange.service.ts::compensate::activityDependency.deleteMany': {
    status: 'exempt',
    reason: "A failed import's rollback of rows it created.",
  },
  'modules/interchange/interchange.service.ts::compensate::activity.deleteMany': {
    status: 'exempt',
    reason: "A failed import's rollback; history for these activities is deleted first.",
  },
  'common/hierarchy/hierarchy-expiry.runner.ts::deleteExpiredScope::crossPlanDependency.deleteMany':
    {
      status: 'exempt',
      reason: 'Permanent expiry (ADR-0096); the subtree and its history go together.',
    },
  'common/hierarchy/hierarchy-expiry.runner.ts::deleteExpiredScope::activityDependency.deleteMany':
    {
      status: 'exempt',
      reason: 'Permanent expiry (ADR-0096).',
    },
  'common/hierarchy/hierarchy-expiry.runner.ts::deleteExpiredScope::resourceAssignment.deleteMany':
    {
      status: 'exempt',
      reason: 'Permanent expiry (ADR-0096).',
    },
  'common/hierarchy/hierarchy-expiry.runner.ts::deleteExpiredScope::activity.deleteMany': {
    status: 'exempt',
    reason: 'Permanent expiry (ADR-0096); history is deleted first, counted and budgeted.',
  },
};

// ─────────────────────────────────────────────────────────────────────────────────────────────

const MODELS = '(activity|activityDependency|crossPlanDependency|resourceAssignment)';
const OPS = '(create|createMany|update|updateMany|upsert|delete|deleteMany)';
const PRISMA_WRITE = new RegExp(`\\.${MODELS}\\.${OPS}\\s*\\(`);
const RAW_WRITE =
  /\b(UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+"?(activities|dependencies|resource_assignments|cross_plan_dependencies)\b/i;
const METHOD_HEADER =
  /^(?: {2}(?:(?:private|public|protected|static|readonly)\s+)*(?:async\s+)?(\w+)\s*(?:<[^>]*>)?\s*\(|(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\()/;

const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'await', 'throw']);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      // The engine reads inputs and writes outputs; its own gate is `check:engine-parity`.
      if (relative(SRC, path) === join('modules', 'schedule', 'engine')) continue;
      out.push(...sourceFiles(path));
    } else if (name.endsWith('.ts') && !/\.(spec|test|e2e-spec)\.ts$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

/** The enclosing method of line `index`, found by walking up to the nearest class-method header. */
function enclosingMethod(lines: readonly string[], index: number): string {
  for (let i = index; i >= 0; i -= 1) {
    const match = METHOD_HEADER.exec(lines[i] as string);
    const name = match ? ((match[1] ?? match[2]) as string) : null;
    // A statement at the method indent (`if (`, `for (`) is not a method.
    if (name !== null && !KEYWORDS.has(name)) return name;
  }
  return '<top level>';
}

function discoverSites(): string[] {
  const found = new Set<string>();
  for (const file of sourceFiles(SRC)) {
    const rel = relative(SRC, file).split('\\').join('/');
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
      const prisma = PRISMA_WRITE.exec(line);
      const raw = RAW_WRITE.exec(line);
      if (prisma) found.add(`${rel}::${enclosingMethod(lines, i)}::${prisma[1]}.${prisma[2]}`);
      if (raw) {
        found.add(
          `${rel}::${enclosingMethod(lines, i)}::${(raw[2] as string).toLowerCase()}.${(raw[1] as string).toUpperCase().split(/\s/)[0]}`,
        );
      }
    });
  }
  return [...found].sort();
}

/** The text of `file`'s method `name`: from its header to the next closing brace at its indent. */
function methodBody(rel: string, name: string): string {
  const lines = readFileSync(join(SRC, rel), 'utf8').split('\n');
  const start = lines.findIndex((l) => {
    const m = METHOD_HEADER.exec(l);
    return m !== null && (m[1] ?? m[2]) === name;
  });
  if (start === -1) return '';
  const indent = (lines[start] as string).match(/^ */)?.[0] ?? '';
  const end = lines.findIndex((l, i) => i > start && l === `${indent}}`);
  return lines.slice(start, end === -1 ? undefined : end + 1).join('\n');
}

describe('activity history coverage census (ADR-0174 D9)', () => {
  it('lists exactly the writes that exist — an undecided write fails here', () => {
    const discovered = discoverSites();
    // A pinned positive case: a census over an empty walk agrees with itself.
    expect(discovered.length).toBeGreaterThanOrEqual(30);
    expect(discovered).toContain(
      'modules/dependencies/dependency.repository.ts::updateIfVersionMatches::activityDependency.updateMany',
    );

    const declared = Object.keys(SITES).sort();
    const undecided = discovered.filter((s) => !(s in SITES));
    const stale = declared.filter((s) => !discovered.includes(s));
    expect(
      undecided,
      'these writes to an activity, a link or an assignment are neither recorded nor exempt — ' +
        'record them in the history (ADR-0174) or exempt them with a reason in SITES',
    ).toEqual([]);
    expect(stale, 'these SITES entries no longer match any write; remove or rename them').toEqual(
      [],
    );
  });

  it('checks every "recorded" claim against the method that is meant to record it', () => {
    const unrecorded: string[] = [];
    for (const [site, entry] of Object.entries(SITES)) {
      if (entry.status !== 'recorded') continue;
      expect(
        entry.recordedBy?.length,
        `${site} says recorded but names no recorder`,
      ).toBeGreaterThan(0);
      for (const ref of entry.recordedBy ?? []) {
        const [file, method] = ref.split('::') as [string, string];
        const body = methodBody(file, method);
        if (!/history\.record\(|this\.recordHistory\(/.test(body))
          unrecorded.push(`${site} ← ${ref}`);
      }
    }
    expect(unrecorded, 'a method that claims to record does not call the history recorder').toEqual(
      [],
    );
  });

  it('keeps the pending queue honest: every entry names the milestone that empties it', () => {
    const pending = Object.entries(SITES).filter(([, s]) => s.status === 'pending-m2');
    expect(pending.length).toBeGreaterThan(0);
    for (const [site, entry] of pending) {
      expect(entry.reason, `${site} is pending but names no task`).toMatch(/\(M2-T\d\)/);
    }
  });

  it('gives every exemption a reason', () => {
    for (const [site, entry] of Object.entries(SITES)) {
      expect(entry.reason.length, `${site} has no reason`).toBeGreaterThan(10);
    }
  });
});
