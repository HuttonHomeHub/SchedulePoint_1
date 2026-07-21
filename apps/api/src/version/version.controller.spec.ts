import { describe, expect, it } from 'vitest';

import { VersionController } from './version.controller';
import { VersionService } from './version.service';

describe('VersionController', () => {
  it('returns the resolved version as the envelope data payload', () => {
    const service = { getVersion: () => '1.2.3' } as VersionService;
    const controller = new VersionController(service);

    // The controller returns the DTO; the TransformInterceptor wraps it as `{ data }`.
    expect(controller.getVersion()).toEqual({ version: '1.2.3' });
  });

  it('propagates the service fallback when the version is unknown', () => {
    const service = { getVersion: () => 'unknown' } as VersionService;
    const controller = new VersionController(service);

    expect(controller.getVersion()).toEqual({ version: 'unknown' });
  });
});
