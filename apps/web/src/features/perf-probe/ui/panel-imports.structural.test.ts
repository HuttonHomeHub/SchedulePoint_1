import { readdirSync, readFileSync } from 'node:fs';
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
/**
 * **Every file of the panel, not one.** The panel was one 1,286-line file and a gate that read it by
 * name; M4 split it (shell, controls, sweep hook, result, copy), and a gate still reading the old
 * name alone would pass against a shell that imports nothing while the file that does the work
 * grew a static edge. So the set is read from the directory, and the pinned positive cases below
 * name the file each fact is true of — a split that moved the dynamic import would fail them rather
 * than pass for want of anything to find.
 */
const DIR = import.meta.dirname;
const PANEL_FILES = readdirSync(DIR).filter(
  (name) =>
    /\.tsx?$/.test(name) && !name.includes('.test.') && name !== 'loading-probe-section.tsx',
);
const read = (name: string): string => readFileSync(join(DIR, name), 'utf8');
const PANEL = PANEL_FILES.map(read).join('\n');
/** Where the runner is reached, and where the registry is named: the files that hold those facts. */
const SWEEP_HOOK = read('use-probe-sweep.ts');
const CONTROLS = read('probe-controls.tsx');

describe('the panel’s imports', () => {
  it('reads the whole split', () => {
    // "No file imports the runner" passes against a scan that found no files at all.
    expect(PANEL_FILES).toEqual(
      expect.arrayContaining([
        'performance-probe-panel.tsx',
        'probe-controls.tsx',
        'probe-sittings.tsx',
        'sitting-block.tsx',
        'sitting-result.tsx',
        'use-probe-sweep.ts',
      ]),
    );
  });

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
    const typeImport = /^import type \{[^}]*\} from '\.\.\/runner\/run-probe';$/m.exec(SWEEP_HOOK);
    expect(
      typeImport,
      'the panel must import the runner’s types, or there is nothing to mutate',
    ).not.toBeNull();
    const withValueImport = SWEEP_HOOK.replace(
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
    expect(SWEEP_HOOK).toMatch(/await import\('\.\.\/runner\/run-probe'\)/);
  });

  it('imports the registry statically, because the list must render before anything downloads', () => {
    // `model/scenarios.ts` is deliberately free of scene imports for exactly this reason: the panel
    // has to name what it can measure without fetching 68 kB to find out.
    expect(CONTROLS).toMatch(/^import \{[^}]*SCENARIOS[^}]*\} from '\.\.\/model\/scenarios';/m);
  });
});

/**
 * **The loading probe's split point, pinned the same way** (`docs/TECH_DEBT.md` #433).
 *
 * The runner reaches the router, so a static edge to it from the staff chunk would make every visit
 * to the console pay for it. The section is the only place that reaches the runner, and it does so
 * twice, both dynamic: to start a press, and to resume one on mount. Both are asserted, because a
 * page with no pending press must load nothing, and a section that never resumes would drop the
 * result on the floor after the reload.
 */
const SECTION = readFileSync(join(import.meta.dirname, 'loading-probe-section.tsx'), 'utf8');

describe('the loading probe section’s imports', () => {
  const valueImports = (source: string): string[] =>
    [...source.matchAll(/^import (?!type )[^\n]*?from\s+'([^']+)';/gm)]
      .map((m) => m[1])
      .filter((spec): spec is string => spec !== undefined);

  it.each([
    ['the panel', PANEL],
    ['the section', SECTION],
  ])('%s never statically imports the loading runner', (_name, source) => {
    expect(valueImports(source).filter((spec) => spec.includes('/loading/runner/'))).toEqual([]);
  });

  it('still catches a VALUE import of the loading runner', () => {
    // Verified red: a static `import { browserEnv } from '../loading/runner/run-loading-probe'`
    // appended to the section is named by the filter above.
    const mutated = `${SECTION}\nimport { browserEnv } from '../loading/runner/run-loading-probe';\n`;
    expect(valueImports(mutated).filter((spec) => spec.includes('/loading/runner/'))).toEqual([
      '../loading/runner/run-loading-probe',
    ]);
  });

  it('DOES reach the runner dynamically, to start a press and to resume one', () => {
    const dynamic = SECTION.match(/await import\('\.\.\/loading\/runner\/run-loading-probe'\)/g);
    expect(dynamic?.length).toBe(2);
    expect(SECTION).toMatch(/resumeLoadingProbe/);
    expect(SECTION).toMatch(/startLoadingProbe/);
  });

  it('asks whether a press is pending from the static marker module, not from the runner', () => {
    expect(SECTION).toMatch(/from '\.\.\/loading\/model\/marker'/);
  });
});
