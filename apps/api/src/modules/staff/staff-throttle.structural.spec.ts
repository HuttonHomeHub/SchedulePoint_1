import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **Every staff route is throttled tighter than the global limit, and no route may be WIDENED.**
 *
 * `@Throttle({ default: { limit: 30, ttl: 60_000 } })` sits on the controller CLASS, so a route
 * added later inherits it by construction — which is the property worth pinning, because the
 * failure mode is a method-level `@Throttle` quietly widening one route. This surface is the most
 * privileged in the product and every successful hit writes a durable row in the one table that
 * cannot be pruned, so a widened route is a way to flood it.
 *
 * ## Amended 2026-09-13: a strictly-tighter override is permitted, and enumerated
 *
 * This file previously asserted `@Throttle` appears **exactly once** in the controller, which is a
 * proxy for the real rule and not the rule. ADR-0140 D7 decided a tighter limit for
 * `diagnostics` — the one route that runs four full-estate aggregates rather than reading a small
 * table — and the M4 gate pass found the decision recorded in the ADR, the plan and the
 * measurement file while the code inherited 30 and this gate structurally forbade the override.
 * Three reviewers reached it independently.
 *
 * So the assertion becomes the thing it was standing in for: **a method-level limit is admitted
 * only if it is strictly smaller than the class's**, and every admitted one is named here with its
 * reason. A widening override still fails, which is the case the original was written for.
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

/** The class-wide bound every route inherits. */
const CLASS_LIMIT = 30;

/**
 * Routes permitted a tighter limit of their own, and why.
 *
 * Named by handler with the reason inline — the shape `dependency-claims.json` and
 * `adr-coverage.json` use — so an override is a decision somebody wrote down rather than a
 * decorator somebody added.
 */
const TIGHTER_OVERRIDES: Readonly<Record<string, { limit: number; reason: string }>> = {
  diagnostics: {
    limit: 6,
    reason:
      'ADR-0140 D7. Every other route here reads a small table or a bounded page and costs ' +
      'single-digit milliseconds; this one runs four aggregates over every activity in the ' +
      'installation, measured at 327-328 ms a press at 102,000 activities. Six a minute caps one ' +
      'caller at ~2.0 s of database time a minute against the inherited 30 capping them at ~9.8 s.',
  },
};

describe('the staff surface’s throttle (ADR-0086)', () => {
  it('declares the class-wide limit, once, at the class', () => {
    const source = code(CONTROLLER);

    expect(source).toMatch(
      new RegExp(
        `@Throttle\\(\\{\\s*default:\\s*\\{\\s*limit:\\s*${String(CLASS_LIMIT)},\\s*ttl:\\s*60_000\\s*\\}\\s*\\}\\)`,
      ),
    );
    // Exactly one decorator carries the class limit. A second one at that value would be a method
    // silently re-stating the inherited bound, which reads as a decision and is not one.
    const atClassLimit =
      source.match(new RegExp(`@Throttle\\([^)]*limit:\\s*${String(CLASS_LIMIT)}[^)]*\\)`, 'g')) ??
      [];
    expect(atClassLimit).toHaveLength(1);
  });

  it('admits a method-level limit only when it is strictly tighter, and names it', () => {
    const source = code(CONTROLLER);
    const limits = [...source.matchAll(/@Throttle\([^)]*limit:\s*(\d+)[^)]*\)/g)].map((m) =>
      Number(m[1]),
    );

    // One class decorator plus one per declared override, and nothing else.
    expect(limits).toHaveLength(1 + Object.keys(TIGHTER_OVERRIDES).length);

    for (const [handler, override] of Object.entries(TIGHTER_OVERRIDES)) {
      expect(
        override.limit,
        `the ${handler} override must be TIGHTER than the class limit, never wider`,
      ).toBeLessThan(CLASS_LIMIT);
      expect(override.reason.length, `the ${handler} override must carry a reason`).toBeGreaterThan(
        80,
      );
      // The declared value is the value in the file. Without this the register is a wish.
      expect(
        limits,
        `the ${handler} override's declared limit must be the one in the code`,
      ).toContain(override.limit);
    }

    // And nothing carries a limit this register has not declared.
    const declared = [CLASS_LIMIT, ...Object.values(TIGHTER_OVERRIDES).map((o) => o.limit)];
    expect(limits.filter((l) => !declared.includes(l))).toEqual([]);
  });

  /**
   * The pinned positive: the scan can see a decorator at all.
   *
   * "No undeclared limit exists" passes perfectly against a regex that matches nothing — the
   * ADR-0093 / ADR-0108 shape, which this repository has now recorded often enough that a census
   * without one should not be reviewed.
   */
  it('finds decorators at all, and the override is really on its handler', () => {
    const source = code(CONTROLLER);

    expect((source.match(/@Throttle\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
    for (const handler of Object.keys(TIGHTER_OVERRIDES)) {
      const at = source.indexOf(`async ${handler}(`);
      expect(at, `${handler} must exist`).toBeGreaterThan(-1);
      // The decorator immediately above it, rather than merely somewhere in the file.
      const before = source.slice(0, at);
      const lastThrottle = before.lastIndexOf('@Throttle(');
      const lastRoute = before.lastIndexOf('@Get(');
      expect(
        lastThrottle,
        `the ${handler} override must sit on ${handler}, not on some earlier route`,
      ).toBeGreaterThan(lastRoute);
    }
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
