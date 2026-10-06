import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **`features/perf-probe` never imports `features/staff`.**
 *
 * The performance probe is mounted by the staff console, so the dependency runs one way: the
 * console's screen imports the probe, and anything the probe needs from the console is handed to it
 * as a prop (`PerformanceProbePanel`'s `apiVersion`) or lives in the shared layer
 * (`StatusSection`). Before the staff console redesign's M0 the probe imported `Panel` and
 * `useStaffInstallation` from `features/staff`, which was a harmless one-way edge while the console's
 * screen sat in `routes/` — and became a cycle the moment that screen moved into `features/staff`
 * (spec §0.3), so this gate lands first.
 *
 * Tests are scanned as well as source: a suite that mocks a staff module is a dependency that
 * production code would otherwise be tempted to grow back.
 */
const ROOT = import.meta.dirname;

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const child = join(dir, entry.name);
    if (entry.isDirectory()) return files(child);
    return /\.(ts|tsx|mjs)$/.test(entry.name) && !entry.name.endsWith('.structural.test.ts')
      ? [child]
      : [];
  });
}

/** Comments are stripped: the reasoning above names the module it forbids. */
const code = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Static, dynamic, `vi.mock` and relative spellings of an import of the staff feature. */
const STAFF_IMPORT =
  /(?:from\s+|import\(\s*|vi\.mock\(\s*|require\(\s*)'(?:@\/features\/staff|(?:\.\.\/)+staff)[/']/;

describe('features/perf-probe does not import features/staff', () => {
  const sources = files(ROOT).map((path) => ({
    path: path.replace(ROOT, ''),
    text: code(readFileSync(path, 'utf8')),
  }));

  it('reads the whole feature', () => {
    // "No file imports staff" passes against a scan that found no files at all.
    expect(sources.length).toBeGreaterThan(20);
    expect(sources.map((file) => file.path)).toContain('/ui/performance-probe-panel.tsx');
  });

  it('imports nothing from the staff feature', () => {
    expect(sources.filter((file) => STAFF_IMPORT.test(file.text)).map((file) => file.path)).toEqual(
      [],
    );
  });

  it.each([
    "import { Panel } from '@/features/staff/ui/panel';",
    "import { useStaffInstallation } from '@/features/staff/api/staff-panels';",
    "const m = await import('@/features/staff/ui/panel');",
    "vi.mock('@/features/staff/api/staff-panels', () => ({}));",
    "import { x } from '../../staff/ui/panel';",
  ])('recognises %s', (line) => {
    expect(STAFF_IMPORT.test(line)).toBe(true);
  });

  it('does not mistake a sibling feature or a prop name for the staff feature', () => {
    expect(STAFF_IMPORT.test("import { x } from '@/features/staffing/thing';")).toBe(false);
    expect(STAFF_IMPORT.test("import { x } from './staff-report';")).toBe(false);
  });
});
