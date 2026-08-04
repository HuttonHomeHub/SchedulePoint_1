/**
 * Resolve the real client IP from `X-Forwarded-For`, trusting only the proxies we are told to.
 *
 * **Why this exists rather than `request.ip`.** Not because `trust proxy` is off — it is **on in
 * production**: `app-setup.ts` calls `app.set('trust proxy', trustedProxyIps)` whenever
 * `TRUSTED_PROXY_IPS` is set, which env validation makes mandatory there. (An earlier version of
 * this docblock asserted the opposite, "checked, not assumed", and was simply wrong — the
 * trust-proxy line predates it by a fortnight. It is corrected rather than quietly deleted because
 * a false claim about a live security setting is worth a sentence saying so.)
 *
 * It exists for two properties `request.ip` does not have:
 *
 * 1. **It answers `null` when it cannot tell**, where `request.ip` always yields *something* — the
 *    immediate peer if the chain is untrustworthy. For an audit column that difference is the whole
 *    point: an operator reading "192.168.0.5" on every event has a field that looks like evidence
 *    and is not, and a blank is the honest answer.
 * 2. **It does not depend on the environment.** `trust proxy` is off in dev and test (no proxies are
 *    declared), so a producer relying on `request.ip` would record something different there than in
 *    production, and the tests would agree with themselves.
 *
 * The walk is **right to left**, which is the only safe direction: a client may send its own
 * `X-Forwarded-For` header, and the proxy chain appends to the right. Everything left of the first
 * untrusted hop is attacker-controlled and must be discarded.
 */

/** An IPv4/IPv6 address or a CIDR block, as `TRUSTED_PROXY_IPS` carries them. */
export type TrustedProxy = string;

function normalise(address: string): string {
  const trimmed = address.trim();
  // Express and Node render IPv4-mapped IPv6 as `::ffff:10.0.0.1`; the configured list will say
  // `10.0.0.1`. Comparing the rendered form against the configured one silently trusts nothing.
  return trimmed.startsWith('::ffff:') ? trimmed.slice('::ffff:'.length) : trimmed;
}

function ipv4ToInt(address: string): number | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;

  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

/**
 * True if `address` falls inside `cidr`. IPv4 only — an IPv6 CIDR returns false rather than
 * guessing, because a wrong "yes" here trusts a hop it should not and lets a spoofed header
 * through. Exact-match still works for IPv6, which covers the single-proxy case.
 */
function inCidr(address: string, cidr: string): boolean {
  const [network, bitsRaw] = cidr.split('/');
  if (network === undefined || bitsRaw === undefined) return false;

  const bits = Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;

  const addressInt = ipv4ToInt(address);
  const networkInt = ipv4ToInt(network);
  if (addressInt === null || networkInt === null) return false;

  // `<<` is signed 32-bit in JS and `bits === 0` would shift by 32 (a no-op), so both edges are
  // handled explicitly rather than by arithmetic that happens to work for the middle of the range.
  if (bits === 0) return true;
  const mask = (-1 << (32 - bits)) >>> 0;
  return (addressInt & mask) >>> 0 === (networkInt & mask) >>> 0;
}

function isTrusted(address: string, trustedProxies: readonly TrustedProxy[]): boolean {
  return trustedProxies.some((entry) => {
    const trimmed = entry.trim();
    if (trimmed === '') return false;
    return trimmed.includes('/') ? inCidr(address, trimmed) : normalise(trimmed) === address;
  });
}

/**
 * The client IP, or `null` when it cannot be established.
 *
 * `null` is a real answer and not a failure to try: a column that is honestly empty is worth more
 * than one filled with the address of our own reverse proxy.
 */
export function resolveClientIp(
  forwardedFor: string | string[] | undefined,
  remoteAddress: string | undefined,
  trustedProxies: readonly TrustedProxy[],
): string | null {
  const header = Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor;
  const hops = (header ?? '')
    .split(',')
    .map(normalise)
    .filter((hop) => hop !== '');

  // No header: the peer IS the client (direct access, as in development).
  if (hops.length === 0) return remoteAddress ? normalise(remoteAddress) : null;

  // With no configured proxies we cannot tell a real hop from a forged one, so the header is
  // ignored entirely rather than half-believed.
  if (trustedProxies.length === 0) return remoteAddress ? normalise(remoteAddress) : null;

  for (let index = hops.length - 1; index >= 0; index -= 1) {
    const hop = hops[index];
    if (hop !== undefined && !isTrusted(hop, trustedProxies)) return hop;
  }

  // Every hop is a proxy we trust. The leftmost is the closest thing to a client we have.
  return hops[0] ?? null;
}
