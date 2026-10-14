import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Principal } from '../../common/auth/principal';
import type { RequestContext } from '../../common/decorators/request-context.decorator';
import { ForbiddenError } from '../../common/errors/domain-errors';
import { VersionService } from '../../version/version.service';
import { auditActor } from '../audit/audit-actor';
import { AuditService } from '../audit/audit.service';
import { OrganizationsService } from '../organizations/organizations.service';

import { EXPORT_FORMAT_VERSION } from './export-columns';
import { createExportWriter, type ExportSummary } from './export-writer';
import { OrganizationExportRepository } from './organization-export.repository';

/** Why an export that had started did not finish. Recorded on the audit row and in the log. */
export type ExportFailureReason = 'client_aborted' | 'timeout' | 'error';

/**
 * Thrown inside the snapshot, after the headers are out, so the transaction rolls back and the
 * caller can tell a stream that broke from a failure to start. Never reaches the exception filter.
 */
class ExportStreamFailed extends Error {
  constructor(
    readonly reason: ExportFailureReason,
    readonly error: unknown,
    readonly summary: ExportSummary,
    readonly bytes: number,
  ) {
    super(`organisation export stopped: ${reason}`);
  }
}

interface ExportOutcome {
  readonly summary: ExportSummary;
  readonly bytes: number;
}

/** Counts what is handed to the response. Passes every chunk through untouched. */
class ByteCounter extends Transform {
  bytes = 0;

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null, data?: Buffer) => void,
  ): void {
    this.bytes += chunk.length;
    callback(null, chunk);
  }
}

/** `20261014T0930Z`, the stamp in the download's name. UTC, so two admins in two zones agree. */
function fileStamp(at: Date): string {
  return `${at.toISOString().slice(0, 16).replace(/[-:]/g, '')}Z`;
}

/**
 * Whether a stream failed because the other end went away: Node's own premature-close error when the
 * response closes under the pipeline, or the abort the `close` handler raised to stop the reads.
 */
function clientWentAway(error: unknown): boolean {
  return (
    error instanceof Error &&
    ((error as NodeJS.ErrnoException).code === 'ERR_STREAM_PREMATURE_CLOSE' ||
      error.name === 'AbortError')
  );
}

function isTimeout(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2028') return true;
  return error instanceof Error && /statement timeout/i.test(error.message);
}

/**
 * The whole-organisation export (ADR-0194): authorise, take one read-only snapshot, stream the ZIP
 * out of it, and record that it happened.
 *
 * **The order is the design.** Scope and permission first (a foreign slug is a 404, a member
 * without the permission a 403, both before any read). Then the snapshot opens and takes the
 * organisation's lock (a second export is a 409). Only then are headers sent, so every refusal is
 * an ordinary JSON envelope; after the first byte nothing can be an envelope and the only honest
 * signal is a destroyed connection. The audit row is written last, outside the snapshot, so it
 * cannot roll back with the thing it describes (the ADR-0073 C3.4 lesson).
 */
@Injectable()
export class OrganizationExportService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly repository: OrganizationExportRepository,
    private readonly audit: AuditService,
    private readonly version: VersionService,
    @InjectPinoLogger(OrganizationExportService.name) private readonly logger: PinoLogger,
  ) {}

  async export(
    principal: Principal,
    orgSlug: string,
    res: Response,
    context: RequestContext,
  ): Promise<void> {
    // Org scope from the caller's OWN memberships (anti-IDOR: a non-member 404s the org), and only
    // then the permission, checked against that organisation.
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    if (!principal.can('organization:export', organization.id)) {
      this.logger.warn(
        {
          userId: principal.userId,
          permission: 'organization:export',
          organizationId: organization.id,
        },
        'authorisation denied',
      );
      throw new ForbiddenError('You do not have permission to perform this action.');
    }

    const startedAt = Date.now();
    const generatedAt = new Date(startedAt);
    const abort = new AbortController();
    // A connection that closes before the response finished is the client leaving: stop reading.
    // Only stop — what to call it is decided from the error the stream actually failed with,
    // because this handler also fires when the pipeline destroys the response after a failure of
    // its own, and that must not be recorded as the client's doing.
    res.once('close', () => {
      if (!res.writableFinished) abort.abort();
    });

    let outcome: ExportOutcome | undefined;
    let failure: ExportStreamFailed | undefined;
    try {
      outcome = await this.repository.reading(organization.id, async (db) => {
        const scope = await this.repository.loadScope(db, organization.id);
        const writer = createExportWriter({
          source: { pages: (file, signal) => this.repository.pages(db, file, scope, signal) },
          signal: abort.signal,
          manifest: {
            generatedAt,
            apiVersion: this.version.getVersion(),
            organization: { id: organization.id, slug: organization.slug, name: organization.name },
            exportedBy: {
              userId: principal.userId,
              name: principal.name ?? principal.email ?? principal.userId,
            },
          },
        });
        const counter = new ByteCounter();

        res.status(200);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="schedulepoint-export-${organization.slug}-${fileStamp(generatedAt)}.zip"`,
        );
        res.setHeader('Cache-Control', 'no-store');
        // Sent now, not with the first body byte: from here a failure can only be a destroyed
        // connection, and a half-set Content-Disposition must never frame a JSON error body.
        res.flushHeaders();
        this.logger.info(
          { organizationId: organization.id, userId: principal.userId },
          'org_export.started',
        );

        let streamError: unknown;
        try {
          await pipeline(writer.output, counter, res);
        } catch (error) {
          streamError = error;
        }
        abort.abort();
        await writer.stop();

        if (streamError !== undefined) {
          const reason: ExportFailureReason = clientWentAway(streamError)
            ? 'client_aborted'
            : isTimeout(streamError)
              ? 'timeout'
              : 'error';
          throw new ExportStreamFailed(reason, streamError, writer.summary(), counter.bytes);
        }
        return { summary: writer.summary(), bytes: counter.bytes };
      });
    } catch (error) {
      if (error instanceof ExportStreamFailed) {
        failure = error;
      } else if (res.headersSent) {
        // The snapshot itself failed after the response began (a commit refused, the ceiling hit
        // between two pages): no envelope is possible, so end the connection and record it.
        failure = new ExportStreamFailed(
          isTimeout(error) ? 'timeout' : 'error',
          error,
          { files: 0, rows: 0, entries: [] },
          0,
        );
        res.destroy();
      } else {
        // Nothing was sent: 409, 500 or the like, as the standard envelope.
        throw error;
      }
    }

    const durationMs = Date.now() - startedAt;
    if (failure !== undefined) {
      const log = failure.reason === 'client_aborted' ? 'warn' : 'error';
      this.logger[log](
        {
          organizationId: organization.id,
          userId: principal.userId,
          reason: failure.reason,
          bytes: failure.bytes,
          durationMs,
          err: failure.error,
        },
        'org_export.failed',
      );
      await this.record(
        principal,
        context,
        organization,
        'FAILURE',
        failure.summary,
        failure.bytes,
        failure.reason,
      );
      return;
    }

    if (outcome === undefined) return;
    this.logger.info(
      {
        organizationId: organization.id,
        userId: principal.userId,
        files: outcome.summary.files,
        rows: outcome.summary.rows,
        bytes: outcome.bytes,
        durationMs,
      },
      'org_export.completed',
    );
    await this.record(principal, context, organization, 'SUCCESS', outcome.summary, outcome.bytes);
  }

  /**
   * Best-effort, and deliberately so. The usual producer rule (`AuditService.record`, in the caller's
   * transaction, failing the action) cannot apply: the bytes have already left and no transaction is
   * left to roll back. A failed write is therefore logged loudly with the action attached, as the
   * authentication family's is, rather than thrown into a response that is already over.
   */
  private async record(
    principal: Principal,
    context: RequestContext,
    organization: { id: string; name: string },
    outcome: 'SUCCESS' | 'FAILURE',
    summary: ExportSummary,
    bytes: number,
    reason?: ExportFailureReason,
  ): Promise<void> {
    await this.audit.recordBestEffort({
      action: 'privacy.exported',
      outcome,
      organizationId: organization.id,
      subjectType: 'ORGANIZATION',
      subjectId: organization.id,
      subjectLabel: organization.name,
      after: {
        formatVersion: EXPORT_FORMAT_VERSION,
        files: summary.files,
        rows: summary.rows,
        bytes,
        includesDeleted: true,
        ...(reason === undefined ? {} : { reason }),
      },
      ...auditActor(principal, context),
    });
  }
}
