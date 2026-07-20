import { Injectable } from '@nestjs/common';
import { importXer, type InterchangeReport } from '@repo/interchange';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { ForbiddenError, NotFoundError, ValidationError } from '../../common/errors/domain-errors';
import { OrganizationsService } from '../organizations/organizations.service';
import { ProjectRepository } from '../projects/project.repository';

import { INTERCHANGE_IMPORT } from './interchange-permissions';
import { INTERCHANGE_MAX_UPLOAD_BYTES } from './interchange.constants';
import type { UploadedInterchangeFile } from './uploaded-file';

/** Machine-readable reasons carried in an interchange {@link ValidationError}'s `details.reason`. */
export const INTERCHANGE_ERROR = {
  /** No multipart file was provided on the upload. */
  NO_FILE: 'NO_FILE',
  /** The uploaded bytes are not a parseable schedule file (not XER / malformed / no project). */
  UNPARSEABLE_FILE: 'UNPARSEABLE_FILE',
} as const;

/**
 * Business logic for schedule interchange (ADR-0050, C2). This is the thin persisting layer's brain: it
 * resolves the org scope from the caller's own memberships (anti-IDOR), pairs it with the
 * `interchange:import` capability check, and asserts the **target project** belongs to that org before
 * doing any work. It then hands the untrusted bytes to the pure, engine-free `@repo/interchange`
 * pipeline (`importXer`) and returns its report.
 *
 * M1 is **stateless dry-run only**: parse → map → validate/repair → report, with **no database write**.
 * A parseable file (even one that needed repairs — the repairs are named in the report) yields a report;
 * a structurally-impossible file (not XER / malformed / no project) is a user-safe rejection. The
 * transactional **commit** (create the plan via existing services + recalculate) is a separate task.
 */
@Injectable()
export class InterchangeService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly projects: ProjectRepository,
    @InjectPinoLogger(InterchangeService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Parse an uploaded file against a target project and return the pre-commit interchange report.
   * Nothing is persisted. Throws {@link ForbiddenError} (403) without the capability, {@link NotFoundError}
   * (404) when the org/project is not the caller's (anti-IDOR), and {@link ValidationError} (422) when no
   * file is supplied or the bytes are not a parseable schedule file.
   */
  async dryRun(
    principal: Principal,
    orgSlug: string,
    projectId: string,
    file: UploadedInterchangeFile | undefined,
  ): Promise<InterchangeReport> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, INTERCHANGE_IMPORT, organization.id);

    // Anti-IDOR: the target project must be an active project in the caller's resolved org.
    const project = await this.projects.findActiveByIdInOrg(projectId, organization.id);
    if (!project) throw new NotFoundError('Project not found.');

    if (!file || file.buffer.length === 0) {
      throw new ValidationError('No file was uploaded.', { reason: INTERCHANGE_ERROR.NO_FILE });
    }

    // Parse → map → validate/repair → report, all pure and side-effect-free. The byte cap is enforced at
    // the HTTP boundary (the multipart interceptor's fileSize limit → 413); it is passed here too as
    // defence-in-depth for the parser.
    const result = importXer({
      content: new Uint8Array(file.buffer),
      filename: file.originalname,
      caps: { maxBytes: INTERCHANGE_MAX_UPLOAD_BYTES },
    });

    if (!result.ok) {
      // A structural impossibility (not XER / malformed / no PROJECT). The pure pipeline's code/message
      // are already user-safe (no internals / stack). Surface them as a 422 without leaking the stage.
      this.logger.warn(
        {
          organizationId: organization.id,
          projectId,
          userId: principal.userId,
          stage: result.error.stage,
          code: result.error.code,
        },
        'interchange dry-run rejected an unparseable file',
      );
      throw new ValidationError(result.error.message, {
        reason: INTERCHANGE_ERROR.UNPARSEABLE_FILE,
        code: result.error.code,
      });
    }

    this.logger.info(
      {
        organizationId: organization.id,
        projectId,
        userId: principal.userId,
        detectedFormat: result.report.detectedFormat,
        mapped: result.report.mapped,
        approximations: result.report.approximations.length,
        repairs: result.report.repairs.length,
        drops: result.report.drops.length,
      },
      'interchange dry-run parsed a file',
    );
    return result.report;
  }

  private assertCan(principal: Principal, permission: Permission, organizationId: string): void {
    if (!principal.can(permission, organizationId)) {
      this.logger.warn(
        { userId: principal.userId, permission, organizationId },
        'authorisation denied',
      );
      throw new ForbiddenError('You do not have permission to perform this action.');
    }
  }
}
