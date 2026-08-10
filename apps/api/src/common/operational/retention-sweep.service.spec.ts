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
  options: { enabled?: boolean; sweepAll?: () => Promise<RetentionSweepResult[]> } = {},
) {
  const sweepAll = vi.fn(options.sweepAll ?? (() => Promise.resolve([result('csp_reports')])));
  const config = {
    retentionSweepEnabled: options.enabled ?? true,
    retentionCspReportsDays: 30,
    retentionMailEventsDays: 365,
    retentionSweepIntervalMinutes: 60,
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
});

afterEach(() => {
  vi.useRealTimers();
});

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
    const { service, sweepAll } = build({ sweepAll: () => Promise.reject(new Error('boom')) });
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
