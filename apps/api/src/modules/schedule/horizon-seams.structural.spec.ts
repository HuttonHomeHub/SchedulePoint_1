import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **Every service seam that can reach the engine's working-time walk maps the typed horizon
 * error** (`docs/TECH_DEBT.md` #205(b), completed by the 2026-08-28 reconciliation pass).
 *
 * The first fix mapped `WorkingTimeHorizonExceededError` → 422 at two seams (`recalculate`, the
 * critical-path test) and the step-7 api review found the SAME unhandled 500 waiting three doors
 * over: `float-paths` calls `computeSchedule` through `computeFloatPaths`, and `earned-value` and
 * `resource-histogram` both reach `addWorkingTime` through per-assignment lag phasing (ADR-0071
 * §1). The mapper cannot live inside the pure engine (the caller must supply calendar-naming
 * context), so each seam re-catches — which is exactly how three of five were missed. This gate
 * makes the enumeration COMPUTED: it scans `schedule.service.ts` (comments stripped — the
 * ADR-0103 lesson: a scan over raw text can be satisfied or defeated by prose) for every call to
 * a walk-entry function and demands `rejectIfWorkingTimeHorizonExceeded` in the same method body.
 * Verified red against the three unmapped seams before they were fixed.
 */
const WALK_ENTRIES = [
  'computeSchedule(',
  'computeFloatPaths(',
  'runCriticalPathTest(',
  'computeEarnedValue(',
  'computeResourceHistogram(',
];

function stripped(): string {
  return readFileSync(join(__dirname, 'schedule.service.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/** The method bodies of the service, split naively on `  async ` / `  private ` boundaries —
 * coarse, but every walk entry and every mapper call sits inside exactly one method, and a split
 * that drifted would surface as a walk entry with no enclosing chunk, which throws below. */
function methodChunks(src: string): string[] {
  return src.split(/\n {2}(?=(?:private |public |async |static ))/);
}

describe('the working-time horizon error is mapped at every service seam', () => {
  it('every engine-walk call site sits in a method that calls the 422 mapper', () => {
    const chunks = methodChunks(stripped());
    const offenders: string[] = [];
    for (const entry of WALK_ENTRIES) {
      const hosts = chunks.filter((c) => c.includes(entry));
      if (hosts.length === 0) {
        throw new Error(
          `no method in schedule.service.ts calls ${entry} — the walk-entry list is stale; ` +
            'a gate that cannot see its subject must refuse rather than pass.',
        );
      }
      for (const host of hosts) {
        if (!host.includes('rejectIfWorkingTimeHorizonExceeded(')) {
          const name = /(?:async |private |public )+([A-Za-z0-9_]+)\s*\(/.exec(host)?.[1] ?? '?';
          offenders.push(`${entry} in ${name}()`);
        }
      }
    }
    expect(
      offenders,
      'these engine-walk call sites can surface WorkingTimeHorizonExceededError as a raw 500 — ' +
        'wrap each in the rejectIfWorkingTimeHorizonExceeded mapper with its calendar context:\n' +
        offenders.join('\n'),
    ).toEqual([]);
  });

  it('is not vacuous: the mapper itself is called at least twice', () => {
    // Without a pinned positive the assertion above would pass equally against a service where
    // the walk entries were renamed away (the ADR-0093 shape).
    const count = (stripped().match(/rejectIfWorkingTimeHorizonExceeded\(/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });
});
