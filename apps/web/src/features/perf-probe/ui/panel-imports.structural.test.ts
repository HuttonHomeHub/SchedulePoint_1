import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **The split point, pinned.**
 *
 * `@repo/seed/scale` is 68,641 B gzip and the painter comes with it, against a staff chunk that is
 * 4,619 B. The panel reaches all of it through `await import('../runner/run-probe')`, which is a
 * split point; a single static import of that module — or of any scene — would put the whole thing
 * in whatever chunk the `/staff` route lands in, silently, with nothing on screen looking different.
 *
 * F2 is the real proof and this is the cheap one that fails first. It matters because the mistake
 * is one character of intent: an editor's auto-import writes the static form, everything still
 * works, and the only symptom is a number in a build report nobody reads on that PR.
 */
const PANEL = readFileSync(join(import.meta.dirname, 'performance-probe-panel.tsx'), 'utf8');

describe('the panel’s imports', () => {
  it('never statically imports the runner or a scene', () => {
    // **Value imports only.** `import type ... from '../runner/run-probe'` is erased entirely by
    // the compiler and creates no runtime edge, so the panel is free to name the runner's types
    // while fetching none of its code — which is exactly what it does. Matching those too was the
    // first version of this test, and it would have forced a worse design (a duplicate set of
    // types beside the panel) to satisfy a gate about bundle size that types cannot affect.
    //
    // A dynamic `await import(...)` is a split point and is deliberately not matched either.
    const staticImports = [...PANEL.matchAll(/^import (?!type )[^\n]*?from\s+'([^']+)';/gm)]
      .map((m) => m[1])
      .filter((spec): spec is string => spec !== undefined);
    const forbidden = staticImports.filter(
      (spec) =>
        spec.includes('/runner/') || spec.includes('/scenes/') || spec.startsWith('@repo/seed'),
    );
    expect(forbidden).toEqual([]);
  });

  it('still catches a VALUE import of the runner', () => {
    // Verified red against what an editor's auto-import writes: the existing `import type` line
    // turned into a value import.
    //
    // **Derived from the file rather than restated.** This case used to hard-code the exact import
    // line, and adding one type to it broke the mutation — loudly, because the assertion is written
    // so a no-op replace fails rather than passes. That is the right way round, and deriving it is
    // better still: the gate keeps testing the thing it names when the import list changes.
    const typeImport = /^import type \{[^}]*\} from '\.\.\/runner\/run-probe';$/m.exec(PANEL);
    expect(
      typeImport,
      'the panel must import the runner’s types, or there is nothing to mutate',
    ).not.toBeNull();
    const withValueImport = PANEL.replace(
      typeImport?.[0] ?? '',
      "import { runProbe } from '../runner/run-probe';",
    );
    const specs = [...withValueImport.matchAll(/^import (?!type )[^\n]*?from\s+'([^']+)';/gm)].map(
      (m) => m[1],
    );
    expect(specs).toContain('../runner/run-probe');
  });

  it('DOES reach the runner dynamically — so a green run above cannot mean "it imports nothing"', () => {
    // The pinned positive case (ADR-0093). Without it, deleting the whole feature satisfies the
    // assertion above perfectly, and a green suite could not tell "correctly split" from "gone".
    expect(PANEL).toMatch(/await import\('\.\.\/runner\/run-probe'\)/);
  });

  it('imports the registry statically, because the list must render before anything downloads', () => {
    // `model/scenarios.ts` is deliberately free of scene imports for exactly this reason: the panel
    // has to name what it can measure without fetching 68 kB to find out.
    expect(PANEL).toMatch(/^import \{[^}]*SCENARIOS[^}]*\} from '\.\.\/model\/scenarios';/m);
  });
});
