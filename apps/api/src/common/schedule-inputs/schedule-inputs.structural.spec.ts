import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ENGINE_ACTIVITY_SELECT } from '../../modules/schedule/schedule.repository';

import {
  ACTIVITY_FIELD_CLASS,
  ASSIGNMENT_FIELD_CLASS,
  DEPENDENCY_FIELD_CLASS,
  PLAN_FIELD_CLASS,
  type InputClass,
} from './schedule-input-fields';

/**
 * "Edited since it was calculated" is only as honest as the list of writes that stamp it
 * (`plans.schedule_inputs_changed_at`). Three things keep that list from rotting, each a statement
 * about source text because the failure it prevents is silent: a field the engine reads that nobody
 * classified, a second writer of the column, and a write path that forgot (or wrongly added) the
 * call. A real database proves the behaviour in `overview.e2e-spec.ts`; this proves the shape.
 */

const SRC = join(__dirname, '../..');
const MODULES = join(SRC, 'modules');

const keysOf = (classes: Record<string, InputClass>, kind: InputClass): string[] =>
  Object.entries(classes)
    .filter(([, value]) => value === kind)
    .map(([key]) => key)
    .sort();

/** The text of one class method, up to the next member at the same indent. Comments are kept. */
function methodBody(file: string, name: string): string {
  const text = readFileSync(join(MODULES, file), 'utf8');
  const start = text.indexOf(`\n  async ${name}(`);
  if (start === -1) throw new Error(`${file} has no method ${name} — this gate reads nothing`);
  const after = text.slice(start + 1);
  const next = after.slice(1).search(/\n {2}(?:async |private |public |\/\*\*)/);
  return next === -1 ? after : after.slice(0, next + 1);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('the scheduling-input classification', () => {
  it('holds the activity INPUT set equal to what the engine reads', () => {
    const engineKeys = Object.keys(ENGINE_ACTIVITY_SELECT)
      .filter((key) => key !== 'id')
      .sort();
    expect(engineKeys).toHaveLength(19);
    expect(keysOf(ACTIVITY_FIELD_CLASS, 'INPUT')).toEqual(engineKeys);
  });

  it('classifies every key of each patch DTO exactly once', () => {
    const dtoKeys = (file: string, exclude: string[] = []): string[] =>
      [...readFileSync(join(MODULES, file), 'utf8').matchAll(/^ {2}(\w+)[?!]:/gm)]
        .map((m) => m[1]!)
        .filter((key) => !exclude.includes(key))
        .sort();

    // `version` is the optimistic lock and `editedField` the triad's control field: neither is
    // persisted scheduling state.
    expect(Object.keys(PLAN_FIELD_CLASS).sort()).toEqual(
      dtoKeys('plans/dto/update-plan.dto.ts', ['version']),
    );
    expect(Object.keys(ASSIGNMENT_FIELD_CLASS).sort()).toEqual(
      dtoKeys('resources/dto/update-assignment.dto.ts', ['version', 'editedField']),
    );
    expect(Object.keys(DEPENDENCY_FIELD_CLASS).sort()).toEqual(
      dtoKeys('dependencies/dto/update-dependency.dto.ts', ['version', 'lagDays']),
    );
  });
});

describe('the writers of plans.schedule_inputs_changed_at', () => {
  it('is written only by the helper; the overview merely reads it', () => {
    const mentions = sourceFiles(SRC)
      .filter((file) =>
        /schedule_inputs_changed_at|scheduleInputsChangedAt/.test(readFileSync(file, 'utf8')),
      )
      .map((file) => relative(SRC, file))
      .sort();
    expect(mentions).toEqual([
      'common/schedule-inputs/mark-schedule-inputs-changed.ts',
      'modules/overview/overview.repository.ts',
    ]);
    const overview = readFileSync(join(MODULES, 'overview/overview.repository.ts'), 'utf8');
    expect(overview).not.toMatch(/SET\s+schedule_inputs_changed_at/i);
  });
});

describe('the write paths that stamp', () => {
  const STAMPING: [string, string[]][] = [
    [
      'activities/activities.service.ts',
      [
        'create',
        'update',
        'updatePlacements',
        'updateParents',
        'updateProgress',
        'remove',
        'bulkDelete',
        'restoreDeleteBatch',
        'dissolveSummary',
        'restore',
      ],
    ],
    ['dependencies/dependencies.service.ts', ['create', 'update', 'remove']],
    ['cross-plan-dependencies/cross-plan-dependencies.service.ts', ['create', 'remove']],
    ['resources/resource-assignment.service.ts', ['create', 'update', 'remove']],
    ['plans/plans.service.ts', ['update']],
  ];

  for (const [file, methods] of STAMPING) {
    for (const method of methods) {
      it(`${file} ${method} calls markScheduleInputsChanged`, () => {
        expect(methodBody(file, method)).toContain('markScheduleInputsChanged(');
      });
    }
  }

  it('leaves out the layout-only and engine-owned paths, which must not stamp', () => {
    expect(methodBody('activities/activities.service.ts', 'updatePositions')).not.toContain(
      'markScheduleInputsChanged',
    );
    expect(methodBody('activities/activity-steps.service.ts', 'replace')).not.toContain(
      'markScheduleInputsChanged',
    );
    expect(methodBody('plans/plans.service.ts', 'restore')).not.toContain(
      'markScheduleInputsChanged',
    );
    for (const file of [
      'schedule/schedule.service.ts',
      'schedule/cross-plan-rederive.service.ts',
      'schedule/finish-milestone-rederive.service.ts',
      'schedule/progressed-visual-rederive.service.ts',
      'interchange/interchange.service.ts',
    ]) {
      expect(readFileSync(join(MODULES, file), 'utf8'), file).not.toContain(
        'markScheduleInputsChanged',
      );
    }
  });
});

describe('where the stamp sits', () => {
  it('is never imported under modules/schedule/, whose transactions stamp schedule_computed_at', () => {
    // `clock_timestamp()` here is always later than the same transaction's `now()`, so one call
    // beside `stampScheduleComputedAt` would leave the plan permanently flagged.
    const importers = sourceFiles(join(MODULES, 'schedule')).filter((file) =>
      /markScheduleInputsChanged|mark-schedule-inputs-changed/.test(readFileSync(file, 'utf8')),
    );
    expect(importers.map((file) => relative(SRC, file))).toEqual([]);
  });

  it('is skipped by the transaction that lost the race to soft-delete a link', () => {
    // The history entry and the stamp share one guard, so two concurrent removes do one of each.
    const between = (body: string, guard: string) => {
      const from = body.indexOf(guard);
      const stamp = body.indexOf('markScheduleInputsChanged(', from);
      expect(from).toBeGreaterThan(-1);
      expect(stamp).toBeGreaterThan(from);
      return body.slice(from, stamp);
    };
    expect(
      between(
        methodBody('cross-plan-dependencies/cross-plan-dependencies.service.ts', 'remove'),
        'if (stamped === 1)',
      ),
    ).not.toMatch(/\n {6}\}\n/);
    expect(
      between(methodBody('dependencies/dependencies.service.ts', 'remove'), "'dependency.deleted'"),
    ).not.toMatch(/\n {6}\}\n/);
    expect(methodBody('dependencies/dependencies.service.ts', 'remove')).toMatch(
      /if \(cascade\.counts\.dependencies === 1\) \{\s+await markScheduleInputsChanged/,
    );
  });
});
