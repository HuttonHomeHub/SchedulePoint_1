import { describe, expect, it } from 'vitest';

import { resolveClientIp } from './client-ip';

// The reference deployment's shape, from a real production log line:
//   x-forwarded-for: "207.11.240.2, 172.69.224.183, 192.168.0.137"
//                     ^ client       ^ Cloudflare    ^ Nginx Proxy Manager
const PROD_CHAIN = '207.11.240.2, 172.69.224.183, 192.168.0.137';
const DOCKER_BRIDGE = ['172.16.0.0/12'];

describe('resolveClientIp', () => {
  it('stops at Cloudflare when only the local hops are trusted — the operator-visible truth', () => {
    // Written expecting '207.11.240.2' and it returned Cloudflare's edge instead. The code was
    // right and the expectation was wrong: 172.69.224.183 is a Cloudflare address and is NOT
    // inside 172.16.0.0/12 (which spans 172.16–172.31 only). So trusting the Docker bridge and
    // the LAN is not enough to see past the CDN.
    //
    // Kept as a test rather than corrected away, because it is the configuration mistake an
    // operator will actually make, and the resulting audit column would look plausible while
    // naming a datacentre in the wrong country.
    expect(resolveClientIp(PROD_CHAIN, '172.20.0.5', ['192.168.0.0/16', ...DOCKER_BRIDGE])).toBe(
      '172.69.224.183',
    );
  });

  it('reaches the real client once the CDN range is trusted too', () => {
    // The whole point, and what a correct TRUSTED_PROXY_IPS buys. `request.ip` would give
    // 192.168.0.137 — our own host — for every event regardless.
    expect(
      resolveClientIp(PROD_CHAIN, '172.20.0.5', [
        '192.168.0.0/16',
        ...DOCKER_BRIDGE,
        '172.64.0.0/13', // one of Cloudflare's published ranges
      ]),
    ).toBe('207.11.240.2');
  });

  it('walks RIGHT to left, so a client-forged header cannot promote itself', () => {
    // A client may send its own X-Forwarded-For; the proxy appends to the right. Everything left
    // of the first untrusted hop is attacker-controlled. Walking left-to-right would return the
    // forged value and record a lie in the audit log.
    const forged = '1.2.3.4, 203.0.113.9, 172.20.0.5';
    expect(resolveClientIp(forged, '172.20.0.5', DOCKER_BRIDGE)).toBe('203.0.113.9');
  });

  it('ignores the header entirely when no proxies are configured', () => {
    // Without a trusted list there is no way to tell a real hop from a forged one, so believing
    // any of it is worse than believing none.
    expect(resolveClientIp('1.2.3.4', '10.0.0.9', [])).toBe('10.0.0.9');
  });

  it('treats the peer as the client when there is no header (direct access)', () => {
    expect(resolveClientIp(undefined, '203.0.113.7', DOCKER_BRIDGE)).toBe('203.0.113.7');
  });

  it('normalises the IPv4-mapped IPv6 form Node renders', () => {
    // Node reports `::ffff:10.0.0.1` while TRUSTED_PROXY_IPS says `10.0.0.1`; comparing the two
    // raw would trust nothing and silently fall through to the wrong hop.
    expect(resolveClientIp('203.0.113.1, ::ffff:10.0.0.1', '::ffff:10.0.0.1', ['10.0.0.1'])).toBe(
      '203.0.113.1',
    );
  });

  it('accepts a header repeated as an array, as Node presents duplicates', () => {
    expect(resolveClientIp(['203.0.113.5', '172.20.0.5'], '172.20.0.5', DOCKER_BRIDGE)).toBe(
      '203.0.113.5',
    );
  });

  it('falls back to the leftmost hop when every hop is trusted', () => {
    expect(resolveClientIp('172.20.0.4, 172.20.0.5', '172.20.0.5', DOCKER_BRIDGE)).toBe(
      '172.20.0.4',
    );
  });

  it('returns null when there is nothing to go on', () => {
    // An honestly empty column beats one filled with our own proxy's address.
    expect(resolveClientIp(undefined, undefined, DOCKER_BRIDGE)).toBeNull();
  });

  describe('CIDR matching', () => {
    it('matches inside the block and rejects outside it', () => {
      expect(resolveClientIp('9.9.9.9, 10.1.2.3', '10.1.2.3', ['10.0.0.0/8'])).toBe('9.9.9.9');
      expect(resolveClientIp('9.9.9.9, 11.1.2.3', '11.1.2.3', ['10.0.0.0/8'])).toBe('11.1.2.3');
    });

    it('handles /0 and /32, the two edges plain shift arithmetic gets wrong', () => {
      // `-1 << 32` is a no-op in JS (shift counts are mod 32), so /0 must be special-cased or it
      // silently behaves like /32 — trusting almost nothing instead of everything.
      expect(resolveClientIp('9.9.9.9, 10.1.2.3', '10.1.2.3', ['0.0.0.0/0'])).toBe('9.9.9.9');
      expect(resolveClientIp('9.9.9.9, 10.1.2.3', '10.1.2.3', ['10.1.2.3/32'])).toBe('9.9.9.9');
      expect(resolveClientIp('9.9.9.9, 10.1.2.4', '10.1.2.4', ['10.1.2.3/32'])).toBe('10.1.2.4');
    });

    it('refuses a malformed CIDR rather than guessing', () => {
      for (const bad of ['10.0.0.0/33', '10.0.0.0/-1', '10.0.0.0/abc', 'nonsense']) {
        expect(resolveClientIp('9.9.9.9, 10.1.2.3', '10.1.2.3', [bad])).toBe('10.1.2.3');
      }
    });

    it('does not pretend to match an IPv6 CIDR', () => {
      // Returning a wrong "yes" here would trust a hop it should not and admit a spoofed header.
      // Exact-match still covers the single-proxy IPv6 case.
      expect(resolveClientIp('9.9.9.9, 2001:db8::1', '2001:db8::1', ['2001:db8::/32'])).toBe(
        '2001:db8::1',
      );
      expect(resolveClientIp('9.9.9.9, 2001:db8::1', '2001:db8::1', ['2001:db8::1'])).toBe(
        '9.9.9.9',
      );
    });
  });
});
