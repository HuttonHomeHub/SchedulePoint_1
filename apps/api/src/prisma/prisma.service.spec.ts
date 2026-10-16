import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaService } from './prisma.service';

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
});
