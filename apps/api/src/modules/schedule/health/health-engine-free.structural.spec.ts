import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **The engine-free gate (health M1-T2): `health/` never imports the CPM engine's compute.**
 *
 * The epic's parity argument is structural — "the CPM engine is not imported, not modified, and the
 * ADR-0034 recalculation parity gate is untouched by construction" — and a claim is worth exactly
 * as much as the thing enforcing it. This scans every source file under `health/` and rejects an
 * import path reaching `engine/compute*`. The one permitted engine-adjacent seam is deliberate and
 * named in the spec: `resolveRemainingMinutes` (a service-boundary helper, `../remaining-duration`)
 * and the injected `workingDaysBetween` built by the SERVICE from the calendar port — neither is
 * `compute.ts`.
 *
 * **Verified red first** (ADR-0110 D5): a temporary `import { computeSchedule } from
 * '../engine/compute'` was added to `compute-health.ts`, this test failed naming that file, and the
 * import was removed. A gate is not finished when it passes; it is finished when it has been made
 * to fail by the defect it was written for.
 *
 * **What it does NOT cover, stated rather than implied:** a transitive import — a helper under
 * `health/` importing a module that itself imports the engine — is invisible to a one-level source
 * scan. The M5 gate pass reads the import graph; this pins the direct temptation.
 */
describe('health M1-T2 — the engine-free structural gate', () => {
  const healthDir = join(__dirname);
  const sources = readdirSync(healthDir).filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'),
  );

  it('scanned a non-zero number of health source files', () => {
    // An assertion that passes against an empty set is not an assertion — ADR-0108's census gate
    // caught itself on exactly this (a glob matching zero files made "nothing is unclassified"
    // vacuously true).
    expect(sources.length).toBeGreaterThan(0);
  });

  it.each(sources)('%s does not import the engine compute', (file) => {
    const text = readFileSync(join(healthDir, file), 'utf8');
    const offending = text
      .split('\n')
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(
        ({ line }) =>
          /from\s+'[^']*engine\/compute/.test(line) || /from\s+'[^']*\/engine'/.test(line),
      );
    expect(
      offending,
      `${file} imports the CPM engine: ${offending.map((o) => `line ${o.n}`).join(', ')}`,
    ).toEqual([]);
  });
});
