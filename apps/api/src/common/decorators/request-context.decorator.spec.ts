import { describe, expect, it } from 'vitest';

import { buildRequestContext, type RequestContextSource } from './request-context.decorator';

const DOCKER_BRIDGE = ['172.20.0.0/16'];

function request(overrides: Partial<RequestContextSource> = {}): RequestContextSource {
  return {
    headers: {},
    socket: { remoteAddress: '172.20.0.5' },
    ...overrides,
  };
}

describe('buildRequestContext', () => {
  it('carries the correlation id, so an audit row joins the log line for the same request', () => {
    // The one field that makes a row investigable: the audit table says WHAT happened, the log
    // says what else the same request did. Without this they are two haystacks.
    const context = buildRequestContext(request({ id: 'req_abc' }), DOCKER_BRIDGE);

    expect(context.correlationId).toBe('req_abc');
  });

  it('resolves the client IP past a trusted proxy rather than recording our own hop', () => {
    const context = buildRequestContext(
      request({
        headers: { 'x-forwarded-for': '203.0.113.9, 172.20.0.5' },
      }),
      DOCKER_BRIDGE,
    );

    expect(context.ipAddress).toBe('203.0.113.9');
  });

  it('never throws on an unauthenticated request with nothing to go on', () => {
    // The case that matters most: a failed sign-in. `CurrentUser` throws when there is no
    // principal; this must not, or the rows worth having would be the ones never written.
    const context = buildRequestContext({ headers: {} }, DOCKER_BRIDGE);

    expect(context).toEqual({ ipAddress: null, userAgent: null, correlationId: null });
  });

  it('drops a repeated user-agent header rather than storing "a,b"', () => {
    // Node presents a duplicated header as an array. Joining it would invent a string no client
    // sent; an honest null beats a fabricated value in a column read as evidence.
    const context = buildRequestContext(
      request({ headers: { 'user-agent': ['Mozilla/5.0', 'curl/8.0'] } }),
      DOCKER_BRIDGE,
    );

    expect(context.userAgent).toBeNull();
  });

  it('carries the user agent raw, leaving truncation to AuditService', () => {
    // Two places deciding the bound is how they come to disagree; the column's limit belongs to
    // the thing that writes the column.
    const hostile = 'U'.repeat(9000);
    const context = buildRequestContext(request({ headers: { 'user-agent': hostile } }), []);

    expect(context.userAgent).toBe(hostile);
  });
});
