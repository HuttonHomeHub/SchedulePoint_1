import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService, SHUTDOWN_DRAIN_TIMEOUT_MS } from './prisma.service';

describe('PrismaService shutdown drains', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('awaits every registered drain before it disconnects', async () => {
    const service = new PrismaService();
    const order: string[] = [];
    vi.spyOn(service, '$disconnect').mockImplementation(() => {
      order.push('disconnect');
      return Promise.resolve();
    });
    service.registerShutdownDrain(async () => {
      await Promise.resolve();
      order.push('drained');
    });

    await service.onModuleDestroy();

    expect(order).toEqual(['drained', 'disconnect']);
  });

  it('disconnects even when a drain fails', async () => {
    const service = new PrismaService();
    const disconnect = vi.spyOn(service, '$disconnect').mockResolvedValue();
    service.registerShutdownDrain(() => Promise.reject(new Error('drain broke')));

    await service.onModuleDestroy();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('disconnects after the bound when a drain never finishes, and warns', async () => {
    vi.useFakeTimers();
    try {
      const service = new PrismaService();
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const disconnect = vi.spyOn(service, '$disconnect').mockResolvedValue();
      service.registerShutdownDrain(() => new Promise<void>(() => undefined));

      const destroyed = service.onModuleDestroy();
      await vi.advanceTimersByTimeAsync(SHUTDOWN_DRAIN_TIMEOUT_MS - 1);
      expect(disconnect).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await destroyed;

      expect(disconnect).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'prisma.shutdown_drain_timed_out' }),
      );
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('warns that a drain registered after shutdown began will not run', async () => {
    const service = new PrismaService();
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(service, '$disconnect').mockResolvedValue();
    const late = vi.fn(() => Promise.resolve());

    await service.onModuleDestroy();
    service.registerShutdownDrain(late);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(late).not.toHaveBeenCalled();
  });
});
