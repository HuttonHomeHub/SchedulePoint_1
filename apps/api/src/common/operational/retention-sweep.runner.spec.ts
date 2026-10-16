import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RETENTION_POLICIES } from './retention-policy';
import { BATCH_SIZE, RetentionSweepRunner } from './retention-sweep.runner';

/**
 * The runner's shutdown behaviour, with Prisma faked (docs/TECH_DEBT.md #303, #259).
 *
 * What the statement deletes is proven against a real Postgres in `test/retention-sweep.e2e-spec.ts`;
 * this file is only about **when the runner stops starting work and what it waits for**, which a real
 * database cannot make deterministic.
 */
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function build(executeRaw: () => Promise<number>) {
  const $executeRaw = vi.fn(executeRaw);
  const registerShutdownDrain = vi.fn();
  const runner = new RetentionSweepRunner(
    { $executeRaw, registerShutdownDrain } as never,
    logger as never,
  );
  return { runner, $executeRaw, registerShutdownDrain };
}

describe('RetentionSweepRunner shutdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers its drain with the Prisma service so the disconnect waits for it', () => {
    const { registerShutdownDrain } = build(() => Promise.resolve(0));

    expect(registerShutdownDrain).toHaveBeenCalledTimes(1);
  });

  it('starts no further table once stopping, and waits for the statement already running', async () => {
    const first = deferred<number>();
    const { runner, $executeRaw } = build(() => first.promise);

    const sweep = runner.sweepAll(new Date());
    expect($executeRaw).toHaveBeenCalledTimes(1);

    let drained = false;
    const drain = runner.drain().then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained, 'drain returned while a statement was still in flight').toBe(false);

    first.resolve(0);
    await drain;
    const results = await sweep;

    expect(results).toHaveLength(1);
    expect($executeRaw).toHaveBeenCalledTimes(1);
    expect(results.length).toBeLessThan(RETENTION_POLICIES.length);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('starts nothing when stopping began before the sweep', async () => {
    const { runner, $executeRaw } = build(() => Promise.resolve(0));

    await runner.drain();
    const results = await runner.sweepAll(new Date());

    expect(results).toEqual([]);
    expect($executeRaw).not.toHaveBeenCalled();
  });

  it('stops between batches of one table and says it was interrupted', async () => {
    const { runner, $executeRaw } = build(() => {
      // A full batch means "more remain"; stopping arrives while the first one runs.
      void runner.drain();
      return Promise.resolve(BATCH_SIZE);
    });

    const [first] = await runner.sweepAll(new Date());

    expect($executeRaw).toHaveBeenCalledTimes(1);
    expect(first?.interrupted).toBe(true);
    expect(first?.error).toBeUndefined();
  });

  it('still logs retention.sweep_failed for a genuine failure while running', async () => {
    // The alert watches this event; stopping must not have become a way to swallow a real one.
    const { runner } = build(() => Promise.reject(new Error('relation does not exist')));

    const results = await runner.sweepAll(new Date());

    expect(results).toHaveLength(RETENTION_POLICIES.length);
    expect(results.every((result) => result.error !== undefined)).toBe(true);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'retention.sweep_failed' }),
      expect.any(String),
    );
  });
});
