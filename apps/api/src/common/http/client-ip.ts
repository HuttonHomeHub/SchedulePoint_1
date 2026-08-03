/**
 * Resolve the real client IP from `X-Forwarded-For`, trusting only the proxies we are told to.
 *
 * **Why this exists rather than `request.ip`.** Express's `trust proxy` setting is deliberately NOT
 * enabled on this app (checked, not assumed), so `request.ip` is the immediate peer — the web
 * container — for every request that arrives through the reverse proxy. Recording that in an audit
 * row would be worse than recording nothing: an operator reading "192.168.0.5" for every event has
 * a column that looks like evidence and is not.
 *
 * **Why not simply switch `trust proxy` on.** It changes `request.ip` AND `request.protocol` for
 * every consumer at once, and `docs/TECH_DEBT.md` #89 records that this deployment currently sends
 * `X-Forwarded-Proto: http` on HTTPS requests. Flipping a global that reads a header we know to be
 * wrong, to fix an unrelated column, is how a small correction becomes an outage. This helper is
 * scoped to the callers that want an IP and changes nothing else.
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
