import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-errors';
import { type PrismaService } from '../../prisma/prisma.service';
import type { ActivityRepository } from '../activities/activity.repository';
import type { DependencyRepository } from '../dependencies/dependency.repository';
import type { OrganizationsService } from '../organizations/organizations.service';
import type { PlanRepository } from '../plans/plan.repository';
import type { ProjectRepository } from '../projects/project.repository';

import {
  INTERCHANGE_ERROR,
  InterchangeService,
  importedNameProbePrefix,
} from './interchange.service';
import type { UploadedInterchangeFile } from './uploaded-file';

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const ORG_SLUG = 'acme';
const PROJECT_ID = '00000000-0000-7000-8000-000000000001';

/** A minimal well-formed single-project, single-activity XER (mirrors @repo/interchange fixtures). */
function validXer(): string {
  return [
    'ERMHDR\t18.8\t2026-01-01\tProject\tadmin\tdb\tdbname\tProjectMgmt\tUSD',
    '%T\tPROJECT',
    '%F\tproj_id\tproj_short_name\tlast_recalc_date\tplan_start_date',
    '%R\tP1\tSample\t2026-01-05 00:00\t2026-01-04 00:00',
    '%T\tTASK',
    '%F\ttask_id\tproj_id\ttask_code\ttask_name\ttask_type\ttarget_drtn_hr_cnt',
    '%R\tT1\tP1\tA1000\tMobilise\tTT_Task\t40',
    '%R\tT2\tP1\tA1010\tDesign\tTT_Task\t80',
    '%T\tTASKPRED',
    '%F\ttask_pred_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt',
    '%R\tR1\tT2\tT1\tPR_FS\t0',
    '%E',
  ].join('\n');
}

/** A valid XER whose logic contains a dangling edge (successor references a missing task) → repaired. */
function xerWithDanglingEdge(): string {
  return [
    'ERMHDR\t18.8\t2026-01-01\tProject\tadmin\tdb\tdbname\tProjectMgmt\tUSD',
    '%T\tPROJECT',
    '%F\tproj_id\tproj_short_name\tlast_recalc_date\tplan_start_date',
    '%R\tP1\tSample\t2026-01-05 00:00\t2026-01-04 00:00',
    '%T\tTASK',
    '%F\ttask_id\tproj_id\ttask_code\ttask_name\ttask_type\ttarget_drtn_hr_cnt',
    '%R\tT1\tP1\tA1000\tOne\tTT_Task\t8',
    '%R\tT2\tP1\tA1010\tTwo\tTT_Task\t8',
    '%T\tTASKPRED',
    '%F\ttask_pred_id\ttask_id\tpred_task_id\tpred_type\tlag_hr_cnt',
    '%R\tR1\tT2\tGHOST\tPR_FS\t0',
    '%E',
  ].join('\n');
}

function fileFrom(content: string, name = 'sample.xer'): UploadedInterchangeFile {
  const buffer = Buffer.from(content, 'utf8');
  return { originalname: name, mimetype: 'application/octet-stream', size: buffer.length, buffer };
}

function principalWith(permissions: Permission[]): Principal {
  return new Principal(USER_ID, [{ organizationId: ORG_ID, role: 'PLANNER', permissions }]);
}

describe('InterchangeService.dryRun', () => {
  let organizations: { resolveScope: ReturnType<typeof vi.fn> };
  let projects: { findActiveByIdInOrg: ReturnType<typeof vi.fn> };
  let plans: { existsActiveNameInProject: ReturnType<typeof vi.fn> };
  let logger: Pick<PinoLogger, 'info' | 'warn' | 'error'>;
  let service: InterchangeService;
  const planner = principalWith(['interchange:import']);

  beforeEach(() => {
    organizations = {
      resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID }, role: 'PLANNER' }),
    };
    projects = { findActiveByIdInOrg: vi.fn().mockResolvedValue({ id: PROJECT_ID }) };
    plans = { existsActiveNameInProject: vi.fn().mockResolvedValue(false) };
    logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    // The commit-path collaborators are unused by these dry-run tests (dry-run never persists), so they
    // are supplied as inert stand-ins (typed `never`, assignable to any param); the commit orchestration
    // is exercised end-to-end in the e2e suite.
    const unused: never = undefined as never;
    service = new InterchangeService(
      organizations as unknown as OrganizationsService,
      projects as unknown as ProjectRepository,
      plans as unknown as PlanRepository,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      logger as unknown as PinoLogger,
    );
  });

  it('returns a report with correct counts for a valid XER (no write)', async () => {
    const report = await service.dryRun(planner, ORG_SLUG, PROJECT_ID, fileFrom(validXer()));
    expect(report.detectedFormat).toBe('XER');
    expect(report.mapped).toEqual({ activities: 2, relationships: 1, calendars: 0 });
    expect(report.repairs).toHaveLength(0);
  });

  it('lists repairs in the report for a file with a dangling edge (still 200-shaped)', async () => {
    const report = await service.dryRun(
      planner,
      ORG_SLUG,
      PROJECT_ID,
      fileFrom(xerWithDanglingEdge()),
    );
    expect(report.mapped.relationships).toBe(0);
    expect(report.repairs.some((r) => r.detail.includes('dangling'))).toBe(true);
  });

  it('refuses with the hand-made path’s 409 when the project already holds the plan name (#541)', async () => {
    plans.existsActiveNameInProject.mockResolvedValue(true);
    const error = await service
      .dryRun(planner, ORG_SLUG, PROJECT_ID, fileFrom(validXer()))
      .then(() => null)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).message).toBe(
      'A plan with this name already exists for this project.',
    );
    expect((error as ConflictError).details).toMatchObject({ reason: 'NAME_TAKEN' });
    // The probe asks about the name the commit would insert, in the target project.
    expect(plans.existsActiveNameInProject.mock.calls[0]?.slice(0, 2)).toEqual([
      PROJECT_ID,
      'Sample',
    ]);
  });

  it('rejects an unrecognised/garbage file with a ValidationError (422)', async () => {
    const error = await service
      .dryRun(planner, ORG_SLUG, PROJECT_ID, fileFrom('not an xer at all', 'junk.txt'))
      .then(() => null)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).details).toMatchObject({
      reason: INTERCHANGE_ERROR.UNPARSEABLE_FILE,
    });
  });

  it('rejects when no file is supplied (422 NO_FILE)', async () => {
    const error = await service
      .dryRun(planner, ORG_SLUG, PROJECT_ID, undefined)
      .then(() => null)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).details).toMatchObject({ reason: INTERCHANGE_ERROR.NO_FILE });
  });

  it('forbids a principal lacking interchange:import (403)', async () => {
    const viewer = principalWith([]);
    await expect(
      service.dryRun(viewer, ORG_SLUG, PROJECT_ID, fileFrom(validXer())),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(projects.findActiveByIdInOrg).not.toHaveBeenCalled();
  });

  it('404s when the target project is not in the caller’s org (anti-IDOR)', async () => {
    projects.findActiveByIdInOrg.mockResolvedValue(null);
    await expect(
      service.dryRun(planner, ORG_SLUG, PROJECT_ID, fileFrom(validXer())),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('propagates the 404 when the caller is not a member of the org', async () => {
    organizations.resolveScope.mockRejectedValue(new NotFoundError('Organisation not found.'));
    await expect(
      service.dryRun(planner, ORG_SLUG, PROJECT_ID, fileFrom(validXer())),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('importedNameProbePrefix (#540)', () => {
  it('keeps a short name whole, so its exact match and every variant are probed', () => {
    expect(importedNameProbePrefix('Standard 5-day', 120)).toBe('Standard 5-day');
  });

  it('clips a near-ceiling name so the clipped variants an import builds still match', () => {
    const name = 'x'.repeat(118);
    const prefix = importedNameProbePrefix(name, 120);
    const variant = `${name.slice(0, 120 - '(imported 2026-10-22) (2)'.length - 1)} (imported 2026-10-22) (2)`;
    expect(prefix.length).toBeLessThan(name.length);
    expect(name.startsWith(prefix)).toBe(true);
    expect(variant.startsWith(prefix)).toBe(true);
  });
});

/** A SchedulePoint XER whose two tasks carry swimlane fields (swimlanes M4-T4). */
function swimlaneXer(): string {
  return [
    'ERMHDR\t18.8\t2026-01-01\tProject\tadmin\tdb\tdbname\tProjectMgmt\tUSD',
    '%T\tPROJECT',
    '%F\tproj_id\tproj_short_name\tlast_recalc_date\tplan_start_date',
    '%R\tP1\tSample\t2026-01-05 00:00\t2026-01-04 00:00',
    '%T\tTASK',
    '%F\ttask_id\tproj_id\ttask_code\ttask_name\ttask_type\ttarget_drtn_hr_cnt',
    '%R\tT1\tP1\tA1000\tMobilise\tTT_Task\t40',
    '%R\tT2\tP1\tA1010\tDesign\tTT_Task\t80',
    '%T\tUDFTYPE',
    '%F\tudf_type_id\ttable_name\tudf_type_name\tudf_type_label\tlogical_data_type',
    '%R\t1\tTASK\tu1\tSchedulePoint layout v1: swimlane\tFT_TEXT',
    '%R\t2\tTASK\tu2\tSchedulePoint layout v1: swimlane lane\tFT_INT',
    '%T\tUDFVALUE',
    '%F\tudf_type_id\tfk_id\tproj_id\tudf_date\tudf_number\tudf_text\tudf_code_id',
    '%R\t1\tT1\tP1\t\t\tSite\t',
    '%R\t1\tT2\tP1\t\t\tsite\t',
    '%R\t2\tT2\tP1\t\t3\t\t',
    '%E',
  ].join('\n');
}

describe('InterchangeService.dryRun — swimlanes', () => {
  const planner = principalWith(['interchange:import']);
  const build = (): InterchangeService => {
    const unused: never = undefined as never;
    return new InterchangeService(
      {
        resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID }, role: 'PLANNER' }),
      } as unknown as OrganizationsService,
      {
        findActiveByIdInOrg: vi.fn().mockResolvedValue({ id: PROJECT_ID }),
      } as unknown as ProjectRepository,
      { existsActiveNameInProject: vi.fn().mockResolvedValue(false) } as unknown as PlanRepository,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as PinoLogger,
    );
  };

  it('counts the swimlanes and their members, merging spellings that differ by case', async () => {
    const report = await build().dryRun(planner, ORG_SLUG, PROJECT_ID, fileFrom(swimlaneXer()));
    expect(report.mapped).toMatchObject({ swimlanes: 1, swimlaneMembers: 2 });
    expect(report.repairs).toEqual([
      expect.objectContaining({
        detail: '1 swimlane name(s) matched an earlier name ignoring case and were merged into it',
      }),
    ]);
  });

  it('applies none of it when the planner declines the layout', async () => {
    const report = await build().dryRun(planner, ORG_SLUG, PROJECT_ID, fileFrom(swimlaneXer()), {
      restoreLayout: 'IGNORE',
    });
    expect(report.mapped).not.toHaveProperty('swimlanes');
    expect(report.mapped).not.toHaveProperty('swimlaneMembers');
  });
});

describe('InterchangeService — laying out swimlane members', () => {
  const ORG = 'org-1';
  const PLAN = 'plan-1';
  interface LayoutRow {
    id: string;
    code: string;
    type: string;
    laneIndex: number;
    version: number;
    swimlaneId: string | null;
    visualEffectiveStart: Date | null;
    visualEffectiveFinish: Date | null;
  }
  const day = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
  const row = (
    id: string,
    code: string,
    swimlaneId: string | null,
    start: string,
    finish: string,
  ): LayoutRow => ({
    id,
    code,
    type: 'TASK',
    laneIndex: 0,
    version: 1,
    swimlaneId,
    visualEffectiveStart: day(start),
    visualEffectiveFinish: day(finish),
  });

  const run = async (
    rows: LayoutRow[],
    carried: Map<string, number>,
    edges: { predecessorId: string; successorId: string }[] = [],
  ) => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const unused: never = undefined as never;
    const prisma = { $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn({})) };
    const service = new InterchangeService(
      unused,
      unused,
      unused,
      unused,
      {
        findLayoutRowsForPlan: vi.fn().mockResolvedValue(rows),
        upsertSwimlaneLanes: upsert,
      } as unknown as ActivityRepository,
      { findEdgesForPlan: vi.fn().mockResolvedValue(edges) } as unknown as DependencyRepository,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      prisma as unknown as PrismaService,
      { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as PinoLogger,
    );
    const result = await (
      service as unknown as {
        packImportedSwimlaneLanes: (
          org: string,
          plan: string,
          carried: Map<string, number>,
          user: string,
        ) => Promise<{ carriedOverlaps: number }>;
      }
    ).packImportedSwimlaneLanes(ORG, PLAN, carried, 'user-1');
    const written = (upsert.mock.calls[0]?.[2] ?? []) as {
      activityId: string;
      basis: string;
      swimlaneId: string;
      laneIndex: number;
    }[];
    return { result, written, upsert };
  };

  it('packs each swimlane on its own, so two swimlanes both start at lane 0', async () => {
    const { written } = await run(
      [
        row('a', 'A1', 'S1', '2026-01-05', '2026-01-09'),
        row('b', 'A2', 'S1', '2026-01-06', '2026-01-10'),
        row('c', 'A3', 'S2', '2026-01-05', '2026-01-09'),
        row('d', 'A4', null, '2026-01-05', '2026-01-09'),
      ],
      new Map(),
    );
    const lanes = Object.fromEntries(written.map((w) => [w.activityId, w.laneIndex]));
    expect(lanes).toEqual({ a: 0, b: 1, c: 0 });
    expect(written.every((w) => w.basis === 'SWIMLANE')).toBe(true);
    expect(written.find((w) => w.activityId === 'c')?.swimlaneId).toBe('S2');
  });

  it('keeps a carried lane and packs the others around it', async () => {
    const { written, result } = await run(
      [
        row('a', 'A1', 'S1', '2026-01-05', '2026-01-09'),
        row('b', 'A2', 'S1', '2026-01-06', '2026-01-10'),
      ],
      new Map([['A1', 4]]),
    );
    const lanes = Object.fromEntries(written.map((w) => [w.activityId, w.laneIndex]));
    expect(lanes['a']).toBe(4);
    expect(lanes['b']).not.toBe(4);
    expect(result.carriedOverlaps).toBe(0);
  });

  it('counts, and does not resolve, carried lanes that overlap in one swimlane', async () => {
    const { written, result } = await run(
      [
        row('a', 'A1', 'S1', '2026-01-05', '2026-01-09'),
        row('b', 'A2', 'S1', '2026-01-06', '2026-01-10'),
      ],
      new Map([
        ['A1', 2],
        ['A2', 2],
      ]),
    );
    expect(written.map((w) => w.laneIndex)).toEqual([2, 2]);
    expect(result.carriedOverlaps).toBe(2);
  });

  it('writes nothing for a plan with no members, and skips a member with no computed dates', async () => {
    const none = await run([row('a', 'A1', null, '2026-01-05', '2026-01-09')], new Map());
    expect(none.upsert).not.toHaveBeenCalled();
    const undated = await run(
      [{ ...row('a', 'A1', 'S1', '2026-01-05', '2026-01-09'), visualEffectiveFinish: null }],
      new Map(),
    );
    expect(undated.upsert).not.toHaveBeenCalled();
  });

  it('lays the same file out the same way whatever order its rows arrive in', async () => {
    const rows = [
      row('a', 'A1', 'S1', '2026-01-05', '2026-01-09'),
      row('b', 'A2', 'S1', '2026-01-05', '2026-01-09'),
      row('c', 'A3', 'S1', '2026-01-05', '2026-01-09'),
    ];
    const forward = await run(rows, new Map());
    const reversed = await run([...rows].reverse(), new Map());
    const byId = (w: { activityId: string; laneIndex: number }[]) =>
      Object.fromEntries(w.map((x) => [x.activityId, x.laneIndex]));
    expect(byId(reversed.written)).toEqual(byId(forward.written));
  });
});
