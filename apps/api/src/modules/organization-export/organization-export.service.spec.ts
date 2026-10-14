import { Readable, Writable } from 'node:stream';

import type { Response } from 'express';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Principal, type Permission } from '../../common/auth/principal';
import type { RequestContext } from '../../common/decorators/request-context.decorator';
import { ConflictError, ForbiddenError, NotFoundError } from '../../common/errors/domain-errors';
import type { VersionService } from '../../version/version.service';
import type { AuditService } from '../audit/audit.service';
import type { OrganizationsService } from '../organizations/organizations.service';

import type { OrganizationExportRepository } from './organization-export.repository';
import { OrganizationExportService } from './organization-export.service';

const ORG = { id: 'org-1', slug: 'acme', name: 'Acme' };
const CONTEXT: RequestContext = {
  ipAddress: '10.0.0.1',
  userAgent: 'test',
  correlationId: 'req-1',
};

function principal(permissions: Permission[]): Principal {
  return new Principal(
    'user-1',
    [{ organizationId: ORG.id, role: 'ORG_ADMIN', permissions }],
    'Ada',
    'ada@example.com',
  );
}

/** A response that is a real Writable, so `pipeline` can drive it, plus the bits of Express we use. */
class FakeResponse extends Writable {
  headersSent = false;
  readonly headers = new Map<string, string>();
  statusCode = 0;
  readonly written: Buffer[] = [];
  destroyedWith: unknown;

  constructor() {
    super();
  }

  override _write(chunk: Buffer, _enc: BufferEncoding, cb: (error?: Error | null) => void): void {
    this.written.push(chunk);
    cb();
  }

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: string): this {
    this.headers.set(name, value);
    return this;
  }

  flushHeaders(): void {
    this.headersSent = true;
  }
}

describe('OrganizationExportService', () => {
  let organizations: { resolveScope: ReturnType<typeof vi.fn> };
  let repository: {
    reading: ReturnType<typeof vi.fn>;
    loadScope: ReturnType<typeof vi.fn>;
    pages: ReturnType<typeof vi.fn>;
  };
  let audit: { recordBestEffort: ReturnType<typeof vi.fn> };
  let logger: Record<'info' | 'warn' | 'error', ReturnType<typeof vi.fn>>;
  let service: OrganizationExportService;

  beforeEach(() => {
    organizations = {
      resolveScope: vi.fn().mockResolvedValue({ organization: ORG, role: 'ORG_ADMIN' }),
    };
    repository = {
      reading: vi.fn((_org: string, read: (db: unknown) => Promise<unknown>) => read({})),
      loadScope: vi.fn().mockResolvedValue({
        organizationId: ORG.id,
        planIds: [],
        calendarIds: [],
        calendarExceptionIds: [],
      }),
      // No rows: every file is an empty array and a header-only CSV.
      pages: vi.fn(() => Readable.from([])),
    };
    audit = { recordBestEffort: vi.fn().mockResolvedValue(undefined) };
    logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    service = new OrganizationExportService(
      organizations as unknown as OrganizationsService,
      repository as unknown as OrganizationExportRepository,
      audit as unknown as AuditService,
      { getVersion: () => '1.2.3' } as unknown as VersionService,
      logger as unknown as PinoLogger,
    );
  });

  const run = (res: FakeResponse, who = principal(['organization:export'])) =>
    service.export(who, 'acme', res as unknown as Response, CONTEXT);

  it('refuses a member without the permission before reading anything or sending a byte', async () => {
    const res = new FakeResponse();

    await expect(run(res, principal([]))).rejects.toBeInstanceOf(ForbiddenError);

    expect(repository.reading).not.toHaveBeenCalled();
    expect(res.headersSent).toBe(false);
    expect(audit.recordBestEffort).not.toHaveBeenCalled();
  });

  it('resolves the organisation from the caller before it checks the permission', async () => {
    organizations.resolveScope.mockRejectedValue(new NotFoundError('Organisation not found.'));
    const res = new FakeResponse();

    await expect(run(res)).rejects.toBeInstanceOf(NotFoundError);

    expect(repository.reading).not.toHaveBeenCalled();
  });

  it('sends no header when the organisation is already being exported, and records nothing', async () => {
    repository.reading.mockRejectedValue(
      new ConflictError('busy', { reason: 'EXPORT_IN_PROGRESS' }),
    );
    const res = new FakeResponse();

    await expect(run(res)).rejects.toBeInstanceOf(ConflictError);

    expect(res.headers.size).toBe(0);
    expect(res.headersSent).toBe(false);
    expect(audit.recordBestEffort).not.toHaveBeenCalled();
  });

  it('sets the headers only inside the snapshot, after the scope is read', async () => {
    const res = new FakeResponse();
    const flush = vi.spyOn(res, 'flushHeaders');

    await run(res);

    expect(repository.loadScope).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(repository.loadScope.mock.invocationCallOrder[0]).toBeLessThan(
      flush.mock.invocationCallOrder[0]!,
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/zip');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Content-Disposition')).toMatch(
      /^attachment; filename="schedulepoint-export-acme-\d{8}T\d{4}Z\.zip"$/,
    );
  });

  it('records a SUCCESS row after the stream, with the bytes handed over and no reason', async () => {
    const res = new FakeResponse();

    await run(res);

    expect(res.writableFinished).toBe(true);
    expect(audit.recordBestEffort).toHaveBeenCalledTimes(1);
    const input = audit.recordBestEffort.mock.calls[0]![0] as Record<string, unknown>;
    expect(input).toMatchObject({
      action: 'privacy.exported',
      outcome: 'SUCCESS',
      organizationId: ORG.id,
      subjectType: 'ORGANIZATION',
      subjectId: ORG.id,
      subjectLabel: 'Acme',
      actorUserId: 'user-1',
    });
    const after = input.after as Record<string, unknown>;
    expect(after.bytes).toBe(res.written.reduce((n, b) => n + b.length, 0));
    expect(after).not.toHaveProperty('reason');
    expect(after).toMatchObject({ formatVersion: '1.0', includesDeleted: true, rows: 0 });
  });

  it('on a failure after the headers: destroys the connection, writes no envelope, records FAILURE and does not throw', async () => {
    repository.pages.mockImplementation((_db: unknown, file: { file: string }) =>
      file.file === 'plans'
        ? new Readable({
            objectMode: true,
            read() {
              this.destroy(new Error('the database went away'));
            },
          })
        : Readable.from([]),
    );
    const res = new FakeResponse();

    await expect(run(res)).resolves.toBeUndefined();

    expect(res.headersSent).toBe(true);
    expect(res.destroyed).toBe(true);
    expect(res.writableFinished).toBe(false);
    // Only ZIP bytes were ever written: no JSON error body follows them.
    expect(Buffer.concat(res.written).toString('latin1')).not.toContain('"error"');
    const input = audit.recordBestEffort.mock.calls[0]![0] as Record<string, unknown>;
    expect(input).toMatchObject({ outcome: 'FAILURE' });
    expect(input.after).toMatchObject({ reason: 'error' });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG.id, reason: 'error' }),
      'org_export.failed',
    );
  });

  it('records FAILURE client_aborted when the connection closes before the response finished', async () => {
    repository.pages.mockImplementation(async function* () {
      yield [{ id: 'x' }];
      // Keep the entry open until the client has gone.
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    const res = new FakeResponse();
    const running = run(res);
    await new Promise((resolve) => setTimeout(resolve, 50));

    res.destroy();
    await running;

    const input = audit.recordBestEffort.mock.calls[0]![0] as Record<string, unknown>;
    expect(input).toMatchObject({ outcome: 'FAILURE' });
    expect(input.after).toMatchObject({ reason: 'client_aborted' });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'client_aborted' }),
      'org_export.failed',
    );
  });
});
