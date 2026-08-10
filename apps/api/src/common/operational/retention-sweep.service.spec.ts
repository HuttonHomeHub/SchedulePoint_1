import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppConfigService } from '../../config/app-config.service';

import { RetentionStatusStore } from './retention-status.store';
import type { RetentionSweepResult, RetentionSweepRunner } from './retention-sweep.runner';
import { RetentionSweepService } from './retention-sweep.service';

/**
 * The scheduler, with the clock faked.
 *
 * These tests are about **when** the sweep runs and never about what it deletes — that is proven
 * against a real Postgres in `test/retention-sweep.e2e-spec.ts`, because a mocked Prisma accepts any
 * statement. The seam exists so this file can be small and that one can be honest.
 */
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function result(table: string, over: Partial<RetentionSweepResult> = {}): RetentionSweepResult {
  return { table, deleted: 0, batches: 1, cappedOut: false, durationMs: 1, ...over };
}

function build(
  options: {
    enabled?: boolean;
    sweepAll?: () => Promise<RetentionSweepResult[]>;
    alertUrl?: string | undefined;
  } = {},
) {
  const sweepAll = vi.fn(options.sweepAll ?? (() => Promise.resolve([result('csp_reports')])));
  const config = {
    retentionSweepEnabled: options.enabled ?? true,
    retentionCspReportsDays: 30,
    retentionMailEventsDays: 365,
    retentionSweepIntervalMinutes: 60,
    mailAlertUrl: 'alertUrl' in options ? options.alertUrl : 'https://alerts.example/hook',
  } as AppConfigService;
  const store = new RetentionStatusStore();
  const service = new RetentionSweepService(
    config,
    { sweepAll } as unknown as RetentionSweepRunner,
    store,
    logger as never,
  );
  return { service, sweepAll, store };
}

beforeEach(() => {
  vi.useFakeTimers();
  logger.info.mockReset();
  logger.warn.mockReset();
  logger.error.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, status: 200 } as Response)),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** The JSON body of the nth alert POST. `body` is a `BodyInit`, so it is narrowed rather than cast. */
const alertBody = (index: number): string => {
  const init = vi.mocked(fetch).mock.calls[index]?.[1];
  return typeof init?.body === 'string' ? init.body : '';
};

describe('RetentionSweepService', () => {
  it('creates NO timer when disabled — not a timer that deletes nothing', async () => {
    // The rollback contract, asserted rather than assumed. `RETENTION_SWEEP_ENABLED=false` has to
    // mean the feature is genuinely inert, or "turn it off" is advice that does not work.
    const { service, sweepAll } = build({ enabled: false });

    service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(10 * 60 * 60 * 1000);

    expect(sweepAll).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('sweeps once at boot rather than waiting a full period', async () => {
    // A container restarted more often than the interval would otherwise never sweep at all.
    const { service, sweepAll } = build();

    service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);

    expect(sweepAll).toHaveBeenCalledTimes(1);
  });

  it('sweeps again on the interval, and stops when the application shuts down', async () => {
    const { service, sweepAll } = build();

    service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(sweepAll).toHaveBeenCalledTimes(2);

    service.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(5 * 60 * 60 * 1000);

    expect(sweepAll).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never runs two sweeps at once', async () => {
    // At the floor interval a slow sweep could still be going when the next tick fires. Overlapping
    // runs would each delete a batch the other had already taken — harmless, but they would also
    // each hold a connection, which at a backlog is how a sweep becomes an outage.
    let release: (() => void) | undefined;
    const { service, sweepAll } = build({
      sweepAll: () =>
        new Promise((resolve) => {
          release = () => {
            resolve([result('csp_reports')]);
          };
        }),
    });

    service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000);

    expect(sweepAll).toHaveBeenCalledTimes(1);
    release?.();
  });

  it('keeps sweeping after a failure, and counts the run as failed', async () => {
    // A broken table must not disable the schedule: the next tick is the retry, which is the whole
    // reason this design can go without one.
    const { service, sweepAll, store } = build({
      sweepAll: () => Promise.resolve([result('csp_reports', { error: 'PrismaClientKnownError' })]),
    });

    service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);

    expect(sweepAll).toHaveBeenCalledTimes(2);
    expect(store.snapshot().consecutiveFailures).toBe(2);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('survives a thrown sweep without an unhandled rejection, and keeps its schedule', async () => {
    // **This test found a real defect rather than confirming one.** Both call sites are
    // `void this.run()`, so before `run` caught its own errors a thrown sweep became an unhandled
    // rejection — which Node treats as fatal. The symptom was not a failing assertion but
    // "Vitest caught 2 unhandled errors", the quiet way that class arrives.
    //
    // Two things are asserted: the schedule survives (the next tick is the retry, which is why this
    // design needs no retry of its own), and the guard is released — without the `finally`, one
    // throw would disable every later tick with nothing in the log to explain it.
    const { service, sweepAll, store } = build({
      sweepAll: () => Promise.reject(new Error('boom')),
    });
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);

    service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    await Promise.resolve();
    process.off('unhandledRejection', unhandled);

    expect(sweepAll).toHaveBeenCalledTimes(2);
    expect(
      unhandled,
      'a void-ed rejection would take the whole process down',
    ).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
    // A throw is a FAILED run. Recording it as `record([], at)` found no failed table and reset the
    // counter, so a sweep crashing on every tick read as healthy — asserted here so a return to
    // that shape fails rather than merely going quiet.
    expect(store.snapshot().consecutiveFailures).toBe(2);
  });

  it('stays silent for the first two failures, alerts once on the third', async () => {
    // The cried-wolf rule (ADR-0075). One failed sweep is usually a connection this process will
    // have again by the next tick — and the next tick IS the retry — so it is not yet news. An
    // alert channel that fires on every blip gets muted, and a muted channel is worth less than no
    // channel because it is believed to be working.
    const { service } = build({
      sweepAll: () => Promise.resolve([result('csp_reports', { error: 'PrismaClientKnownError' })]),
    });

    service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch, 'the first failure is not news').not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(fetch, 'nor is the second').not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(alertBody(0)).toContain('retention.sweep_failing');
  });

  it('sends ONE message however long the outage lasts', async () => {
    // Without the latch a relay outage sends one message per tick, forever — the exact failure the
    // threshold exists to prevent, reintroduced by the mechanism meant to report it.
    const { service } = build({
      sweepAll: () => Promise.resolve([result('csp_reports', { error: 'PrismaClientKnownError' })]),
    });

    service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(10 * 60 * 60 * 1000);

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('re-arms after a clean run, so a later outage is a NEW incident', async () => {
    let broken = true;
    const { service } = build({
      sweepAll: () =>
        Promise.resolve([
          broken
            ? result('csp_reports', { error: 'PrismaClientKnownError' })
            : result('csp_reports'),
        ]),
    });

    service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
    expect(fetch).toHaveBeenCalledTimes(1);

    broken = false;
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    broken = true;
    await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000);

    expect(fetch, 'a recovered-then-broken sweep is a second incident').toHaveBeenCalledTimes(2);
  });

  it('alerts on a sweep that THROWS, not only on one that reports a failure', async () => {
    // The failure mode nobody anticipated must not also be the one that never reaches anybody.
    const { service } = build({ sweepAll: () => Promise.reject(new Error('boom')) });

    service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('names tables and counts, and NOTHING from a row', async () => {
    // This POST leaves the system for a third-party chat service, which is data egress. One of
    // these tables holds attacker-controlled strings and the other a customer's address.
    const { service } = build({
      sweepAll: () => Promise.resolve([result('mail_events', { error: 'PrismaClientKnownError' })]),
    });

    service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);

    const body = alertBody(0);
    expect(body).toContain('mail_events');
    expect(body).toContain('3 runs in a row');
    expect(body).not.toMatch(/@|https?:\/\/(?!.*alerts\.example)/);
  });

  it('attempts NO alert when the operator has configured no webhook', async () => {
    const { service } = build({
      alertUrl: undefined,
      sweepAll: () => Promise.resolve([result('csp_reports', { error: 'PrismaClientKnownError' })]),
    });

    service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(5 * 60 * 60 * 1000);

    expect(fetch).not.toHaveBeenCalled();
  });

  it('logs the effective periods at boot, because a mistyped one is irreversible', () => {
    const { service } = build();

    service.onApplicationBootstrap();

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'retention.configured',
        cspReportsDays: 30,
        mailEventsDays: 365,
      }),
      expect.any(String),
    );
  });
});
