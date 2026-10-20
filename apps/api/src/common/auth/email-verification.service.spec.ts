import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { AppConfigService } from '../../config/app-config.service';

import type { AuthInstance } from './better-auth';
import { EmailVerificationService } from './email-verification.service';

/** A handler that records the request it was given and answers with `reply`. */
function harness(reply: Response = Response.json({ status: true })) {
  const seen: Request[] = [];
  const auth = {
    handler: (request: Request) => {
      seen.push(request);
      return Promise.resolve(reply);
    },
  } as unknown as AuthInstance;
  const config = { betterAuthUrl: 'http://localhost:3000' } as AppConfigService;
  return { service: new EmailVerificationService(auth, config), seen };
}

describe('EmailVerificationService', () => {
  it('forwards the caller’s user agent and address, capped, and nothing else', async () => {
    const { service, seen } = harness();

    await service.confirm('tok', { userAgent: 'u'.repeat(900), forwardedFor: '1.2.3.4' });

    const request = seen[0];
    expect(request?.method).toBe('GET');
    expect(new URL(request?.url ?? '').searchParams.get('token')).toBe('tok');
    expect(request?.headers.get('user-agent')).toHaveLength(512);
    expect(request?.headers.get('x-forwarded-for')).toBe('1.2.3.4');
  });

  it('answers a header that cannot be built with a 400, not a 500', async () => {
    const { service, seen } = harness();

    await expect(
      service.confirm('tok', { userAgent: 'bad\nvalue', forwardedFor: undefined }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(seen).toHaveLength(0);
  });
});
