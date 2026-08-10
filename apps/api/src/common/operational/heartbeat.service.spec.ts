import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppConfigService } from '../../config/app-config.service';

import { HeartbeatService } from './heartbeat.service';

/**
 * The dormancy assertions here are the load-bearing ones, and they are the reason this suite
 * exists at all.
 *
 * CQ-4 was answered "build it, wire a receiver later" rather than the spec's own fallback of not
 * building it — which is defensible **only** if absent config starts nothing. Once both are silent,
 * nothing observable distinguishes "not configured" from "configured and posting into a void", so
 * the distinction has to be pinned by a test or it is only an intention.
 */

const INTERVAL_MS = 5 * 60_000;

function build(url: string | undefined): {
  service: HeartbeatService;
  debug: ReturnType<typeof vi.fn>;
} {
  const debug = vi.fn();
  const config = { heartbeatUrl: url, heartbeatIntervalMs: INTERVAL_MS } as AppConfigService;
  const logger = { debug } as unknown as ConstructorParameters<typeof HeartbeatService>[1];

  return { service: new HeartbeatService(config, logger), debug };
}

describe('HeartbeatService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('creates NO timer at all when no URL is configured', () => {
    // The rollback contract. Not "a timer that posts nowhere" — no timer.
    const { service } = build(undefined);

    service.onApplicationBootstrap();

    expect(vi.getTimerCount()).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('pings once at boot rather than waiting a full period', async () => {
    // A container crash-looping faster than the interval would otherwise never ping, and the switch
    // would report an outage that is real but for the wrong reason.
    const { service } = build('https://hc-ping.com/abc');

    service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);

    expect(fetch).toHaveBeenCalledTimes(1);
    service.onApplicationShutdown();
  });

  it('pings on the interval', async () => {
    const { service } = build('https://hc-ping.com/abc');

    service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);

    // The boot ping plus three intervals.
    expect(fetch).toHaveBeenCalledTimes(4);
    service.onApplicationShutdown();
  });

  it('does not throw, and does not warn, when the receiver is unreachable', async () => {
    // A missed ping is exactly what the receiver watches for, so it will say so far more usefully
    // than a log line. Warning here would fill the stream with noise about the health of the
    // monitoring, training an operator to ignore the stream carrying the real signal.
    vi.mocked(fetch).mockRejectedValue(new Error('network unreachable'));
    const { service, debug } = build('https://hc-ping.com/abc');

    expect(() => {
      service.onApplicationBootstrap();
    }).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);

    expect(debug).toHaveBeenCalled();
    service.onApplicationShutdown();
  });

  it('never logs the URL, which is a bearer credential in path form', async () => {
    // Anyone holding `hc-ping.com/<uuid>` can suppress the alarm.
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 503 } as Response);
    const { service, debug } = build('https://hc-ping.com/s3cr3t-uuid');

    service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);

    expect(JSON.stringify(debug.mock.calls)).not.toContain('s3cr3t-uuid');
    service.onApplicationShutdown();
  });

  it('stops pinging after shutdown', async () => {
    // A leaked interval fails silently: the process never exits, which reads as a hang.
    const { service } = build('https://hc-ping.com/abc');

    service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    service.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS * 5);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('is safe to shut down when it never started', () => {
    const { service } = build(undefined);

    service.onApplicationBootstrap();

    expect(() => {
      service.onApplicationShutdown();
    }).not.toThrow();
  });
});
