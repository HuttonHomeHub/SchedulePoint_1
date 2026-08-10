import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppConfigService } from '../../config/app-config.service';
import type { PrismaService } from '../../prisma/prisma.service';

import { errorClassOf, OperationalAlertService } from './operational-alert.service';

/**
 * The alerter's contract is almost entirely about what it does **not** do — never throw, never
 * block, never post an address, never count one send twice — so most of these assert an absence.
 * That is the point rather than a weakness: this service exists inside a `catch` block that has
 * already handled a failed send, and every one of those absences is a way it could make a handled
 * failure worse.
 */

const WINDOW_MS = 10 * 60_000;

function build(overrides: { alertUrl?: string | undefined } = {}): {
  service: OperationalAlertService;
  create: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
} {
  const create = vi.fn().mockResolvedValue({});
  const warn = vi.fn();
  const prisma = { mailEvent: { create } } as unknown as PrismaService;
  const config = {
    mailAlertUrl: 'alertUrl' in overrides ? overrides.alertUrl : 'https://alerts.example/hook',
    mailAlertWindowMs: WINDOW_MS,
  } as AppConfigService;
  const logger = { warn } as unknown as ConstructorParameters<typeof OperationalAlertService>[2];

  return { service: new OperationalAlertService(prisma, config, logger), create, warn };
}

/** The JSON body of the nth alert POST. Typed rather than stringified — `body` is a `BodyInit`. */
const alertBody = (index: number): string => {
  const init = vi.mocked(fetch).mock.calls[index]?.[1];
  return typeof init?.body === 'string' ? init.body : '';
};

/** Let the un-awaited `persist`/`post` microtasks settle — the service deliberately returns void. */
const settle = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const failure = {
  kind: 'password_reset',
  outcome: 'FAILED',
  recipient: 'someone@example.com',
  error: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
} as const;

describe('errorClassOf', () => {
  it('prefers an errno, which says more than the constructor name', () => {
    expect(errorClassOf(Object.assign(new Error('nope'), { code: 'ECONNREFUSED' }))).toBe(
      'ECONNREFUSED',
    );
  });

  it('falls back to the constructor name', () => {
    expect(errorClassOf(new TypeError('bad'))).toBe('TypeError');
  });

  it('NEVER returns anything that could carry an address', () => {
    // The whole reason this function exists. A transport error's `message` routinely embeds the
    // recipient — `550 5.1.1 <someone@example.com>: Recipient address rejected` — and the address
    // belongs in the `recipient` column, where ADR-0085 D1 erasure can reach it. A second copy
    // inside a free-text blob is unreachable, which is why there is no `message` column at all.
    const leaky = new Error('550 5.1.1 <someone@example.com>: Recipient address rejected');
    expect(errorClassOf(leaky)).toBe('Error');
  });

  it('returns null rather than inventing a class for a thrown non-object', () => {
    // 'Unknown' would dress an absence up as a fact. A thrown string has no class.
    expect(errorClassOf('boom')).toBeNull();
    expect(errorClassOf(null)).toBeNull();
    expect(errorClassOf(undefined)).toBeNull();
  });

  it('rejects a code that would violate ck_mail_events_error_class_shape', () => {
    // The producer half of the DB constraint. Reaching the constraint is a bug, because a rejected
    // insert inside a catch block turns one failed send into two errors.
    expect(errorClassOf(Object.assign(new Error('x'), { code: 'not a code' }))).toBe('Error');
  });
});

describe('OperationalAlertService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('records the failure and alerts on the first one immediately', async () => {
    const { service, create } = build();

    service.recordMailFailure(failure);
    await settle();

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      data: { kind: 'password_reset', outcome: 'FAILED', errorClass: 'ECONNREFUSED' },
    });
    // The window bounds the repeats, never the notification.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('NEVER puts a recipient in the alert body', async () => {
    // The row holds the address (CQ-1) and a staff member may read it behind the guard, audited.
    // This POST goes to a third-party chat service, which is egress — the same ground on which the
    // spec rejects a third-party CSP collector.
    const { service } = build();

    service.recordMailFailure(failure);
    await settle();

    const body = alertBody(0);
    expect(body).not.toContain('someone@example.com');
    expect(body).not.toContain('example.com');
  });

  it('coalesces a storm into one alert plus one summary', async () => {
    const { service } = build();

    for (let i = 0; i < 10; i += 1) service.recordMailFailure(failure);
    await settle();

    expect(fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(WINDOW_MS);
    await settle();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(alertBody(1)).toContain('10');
  });

  it('sends no summary when the opening failure was the only one', async () => {
    // A lone transient blip should cost exactly one message, not one and a summary of it.
    const { service } = build();

    service.recordMailFailure(failure);
    await vi.advanceTimersByTimeAsync(WINDOW_MS);
    await settle();

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does NOT count an ABANDONED row toward the alert', async () => {
    // One timed-out send writes BOTH outcomes: the caller's catch fires at +10s (FAILED) and the
    // real transport error arrives later from a detached catch (ABANDONED). Two rows deliberately,
    // one failed send — counting both would inflate every alert during exactly the outage the count
    // is meant to size, and a number an operator learns to halve is worse than no number.
    const { service, create } = build();

    service.recordMailFailure(failure);
    service.recordMailFailure({ ...failure, outcome: 'ABANDONED' });
    await settle();

    expect(create).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(WINDOW_MS);
    await settle();

    // Still one: the ABANDONED row never entered the count, so there is no summary to send.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('writes the row but posts nothing when no alert URL is configured', async () => {
    // The rollback contract, asserted rather than assumed. The durable history is useful on its own
    // and costs nothing; the alert is the part that needs somewhere to go.
    const { service, create } = build({ alertUrl: undefined });

    service.recordMailFailure(failure);
    await settle();

    expect(create).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not throw when the insert fails', async () => {
    // It runs inside a catch block that has already handled a failed send. A throw here converts
    // one handled failure into an unhandled one.
    const create = vi.fn().mockRejectedValue(new Error('db down'));
    const warn = vi.fn();
    const service = new OperationalAlertService(
      { mailEvent: { create } } as unknown as PrismaService,
      { mailAlertUrl: undefined, mailAlertWindowMs: WINDOW_MS } as AppConfigService,
      { warn } as unknown as ConstructorParameters<typeof OperationalAlertService>[2],
    );

    expect(() => service.recordMailFailure(failure)).not.toThrow();
    await settle();
    expect(warn).toHaveBeenCalled();
  });

  it('does not throw when the alert endpoint is unreachable', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network unreachable'));
    const { service, warn } = build();

    expect(() => service.recordMailFailure(failure)).not.toThrow();
    await settle();
    expect(warn).toHaveBeenCalled();
  });

  it('never logs the alert URL, which is frequently the credential', async () => {
    // `https://hooks.slack.com/services/T…/B…/<secret>` — logs are retained and shipped. The log
    // context is allow-listed to { status, kind, count }, the `smtpEndpoint` rule.
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response);
    const { service, warn } = build({ alertUrl: 'https://hooks.example/services/T1/B2/s3cr3t' });

    service.recordMailFailure(failure);
    await settle();

    expect(JSON.stringify(warn.mock.calls)).not.toContain('s3cr3t');
  });

  it('clears a pending window on shutdown', () => {
    // A leaked timer fails silently: the process simply never exits, which reads as a hang.
    const { service } = build();

    service.recordMailFailure(failure);
    service.onApplicationShutdown();

    expect(vi.getTimerCount()).toBe(0);
  });
});
