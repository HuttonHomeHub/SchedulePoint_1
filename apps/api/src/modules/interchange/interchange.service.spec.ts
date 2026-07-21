import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import { ForbiddenError, NotFoundError, ValidationError } from '../../common/errors/domain-errors';
import type { OrganizationsService } from '../organizations/organizations.service';
import type { ProjectRepository } from '../projects/project.repository';

import { INTERCHANGE_ERROR, InterchangeService } from './interchange.service';
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
  let logger: Pick<PinoLogger, 'info' | 'warn' | 'error'>;
  let service: InterchangeService;
  const planner = principalWith(['interchange:import']);

  beforeEach(() => {
    organizations = {
      resolveScope: vi.fn().mockResolvedValue({ organization: { id: ORG_ID }, role: 'PLANNER' }),
    };
    projects = { findActiveByIdInOrg: vi.fn().mockResolvedValue({ id: PROJECT_ID }) };
    logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    // The commit-path collaborators are unused by these dry-run tests (dry-run never persists), so they
    // are supplied as inert stand-ins (typed `never`, assignable to any param); the commit orchestration
    // is exercised end-to-end in the e2e suite.
    const unused: never = undefined as never;
    service = new InterchangeService(
      organizations as unknown as OrganizationsService,
      projects as unknown as ProjectRepository,
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
