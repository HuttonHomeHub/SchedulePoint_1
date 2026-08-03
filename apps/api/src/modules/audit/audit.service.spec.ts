import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuditRepository } from './audit.repository';
import { AuditService, type RecordAuditInput } from './audit.service';

const create = vi.fn();
const repository = { create } as unknown as AuditRepository;
const logger = {
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
} as unknown as PinoLogger;

const membershipEvent: RecordAuditInput = {
  action: 'member.role_changed',
  outcome: 'SUCCESS',
  actorType: 'USER',
  actorUserId: 'u_admin',
  actorLabel: 'admin@example.com',
  organizationId: 'org_1',
  subjectType: 'ORG_MEMBER',
  subjectId: 'm_1',
  before: { role: 'VIEWER' },
  after: { role: 'PLANNER' },
};

function service(): AuditService {
  return new AuditService(repository, logger);
}

describe('AuditService.record — failure rolls the caller back', () => {
  beforeEach(() => {
    create.mockReset().mockResolvedValue({});
    vi.mocked(logger).error = vi.fn();
  });

  it('THROWS when the insert fails, so the audited action cannot commit without its record', async () => {
    // The load-bearing test, and the opposite of MailService.sendInvitation's rule. A swallowed
    // audit write leaves an action that happened with no record that it did — and nothing on any
    // screen reveals it, because absence is indistinguishable from "nothing happened".
    create.mockRejectedValue(new Error('deadlock detected'));

    await expect(service().record(membershipEvent)).rejects.toThrow(/deadlock/);
  });

  it('passes the transaction client through, so the row joins the caller’s transaction', async () => {
    const tx = { marker: 'tx' } as never;
    await service().record(membershipEvent, tx);

    expect(create).toHaveBeenCalledWith(expect.anything(), tx);
  });

  it('redacts before writing — a producer’s unlisted fields never reach the repository', async () => {
    await service().record({
      ...membershipEvent,
      before: { role: 'VIEWER', email: 'private@example.com' },
      after: { role: 'PLANNER', email: 'private@example.com' },
    });

    expect(JSON.stringify(create.mock.calls[0]?.[0])).not.toContain('private@example.com');
  });

  it('truncates a hostile user agent rather than storing it whole', async () => {
    await service().record({ ...membershipEvent, userAgent: 'U'.repeat(9000) });

    const row = create.mock.calls[0]?.[0] as { userAgent: string };
    expect(row.userAgent.length).toBe(512);
  });

  it('writes undefined rather than null for empty changes, so the column stays NULL', async () => {
    // `null` and `undefined` differ to Prisma for a nullable Json column; passing null writes a
    // JSON null literal, which is not the same as no payload and would defeat `IS NULL` reads.
    await service().record({ ...membershipEvent, before: {}, after: {} });

    const row = create.mock.calls[0]?.[0] as { changes?: unknown };
    expect(row.changes).toBeUndefined();
  });
});

describe('AuditService.recordBestEffort — failure must not fail its caller', () => {
  beforeEach(() => {
    create.mockReset().mockResolvedValue({});
    vi.mocked(logger).error = vi.fn();
  });

  it('RESOLVES when the insert fails, and logs it', async () => {
    // The inverted trade, for the authentication family: there is no transaction to roll back, and
    // refusing every sign-in because the audit table is unavailable turns a logging fault into an
    // outage. The gap is named in ADR-0072 rather than hidden.
    create.mockRejectedValue(new Error('connection terminated'));

    await expect(
      service().recordBestEffort({
        action: 'auth.signed_in',
        outcome: 'SUCCESS',
        actorType: 'USER',
        actorUserId: 'u_1',
        subjectType: 'USER',
      }),
    ).resolves.toBeUndefined();

    expect(vi.mocked(logger).error).toHaveBeenCalled();
  });

  it('records an anonymous failed sign-in with no actor id', async () => {
    await service().recordBestEffort({
      action: 'auth.sign_in_failed',
      outcome: 'FAILURE',
      actorType: 'ANONYMOUS',
      subjectType: 'USER',
      subjectLabel: 'someone@example.com',
      ipAddress: '203.0.113.4',
    });

    const row = create.mock.calls[0]?.[0] as { actorUserId: string | null; changes?: unknown };
    // ck_audit_events_actor_shape rejects an ANONYMOUS row carrying an actor id, so this is not
    // merely tidy — getting it wrong is a lost row.
    expect(row.actorUserId).toBeNull();
    expect(row.changes).toBeUndefined();
  });
});
