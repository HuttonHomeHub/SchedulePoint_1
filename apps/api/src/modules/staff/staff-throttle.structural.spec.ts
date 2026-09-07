import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **Every staff route is throttled tighter than the global limit, and no route may opt out.**
 *
 * `@Throttle({ default: { limit: 30, ttl: 60_000 } })` sits on the controller CLASS, so a route
 * added later inherits it by construction — which is the property worth pinning, because the
 * failure mode is a method-level `@Throttle` quietly widening one route. This surface is the most
 * privileged in the product and every successful hit writes a durable row in the one table that
 * cannot be pruned, so a widened route is a way to flood it.
 *
 * ## Why this is a source scan and not a request
 *
 * The honest behavioural test is to fire 31 requests and expect a 429 — and it cannot live here.
 * `ThrottlerGuard` keys on the caller's IP, `vitest.e2e.config.mts` sets `fileParallelism: false`,
 * and the TTL is a minute: exhausting the bucket would make every later test in the shared process
 * fail with 429s that have nothing to do with what they assert. That is a worse instrument than
 * this one, so the trade is made deliberately rather than by omission.
 *
 * **What this therefore does NOT prove**, stated rather than implied: that `ThrottlerGuard` is
 * registered (it is, as an `APP_GUARD` in `app.module.ts`, and other suites drive it), or that the
 * limit is the right number. It proves the decorator governs the class and that no method has
 * escaped it.
 */
const CONTROLLER = join(__dirname, 'staff.controller.ts');

/** Comments stripped: this file's own prose quotes the decorator it forbids at method level. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

describe('the staff surface’s throttle (ADR-0086)', () => {
  it('declares the tighter limit once, at the class', () => {
    const source = code(CONTROLLER);
    const throttles = source.match(/@Throttle\(/g) ?? [];

    expect(throttles).toHaveLength(1);
    expect(source).toMatch(
      /@Throttle\(\{\s*default:\s*\{\s*limit:\s*30,\s*ttl:\s*60_000\s*\}\s*\}\)/,
    );
  });

  it('puts that decorator above the class, so every route inherits it', () => {
    const source = code(CONTROLLER);
    const throttleAt = source.indexOf('@Throttle(');
    const classAt = source.indexOf('export class StaffController');
    const firstRouteAt = source.search(/@(Get|Post|Put|Patch|Delete)\(/);

    expect(throttleAt).toBeGreaterThan(-1);
    expect(throttleAt).toBeLessThan(classAt);
    // And before the first route, which is what distinguishes "on the class" from "on a method"
    // once a route is added above the others.
    expect(throttleAt).toBeLessThan(firstRouteAt);
  });
});
