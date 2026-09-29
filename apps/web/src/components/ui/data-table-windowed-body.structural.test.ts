import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

/**
 * **`useVirtualizer` lives in the windowed child and in two feature components, and nowhere else** (ADR-0165 D5).
 *
 * The hook makes the React Compiler's lint analysis bail out of the WHOLE component that calls it.
 * `DataTable` has 24 call sites in 18 files, so the hook must not sit in it (or in any other shared
 * primitive): it sits in `DataTableWindowedBody`, which only the windowed mode renders.
 *
 * It reads imports of `@tanstack/react-virtual`, so an alias or a re-export through a barrel would
 * escape it; nothing does that today.
 */
const ALLOWED = [
  'src/components/ui/data-table-windowed-body.tsx',
  'src/features/gantt/components/GanttPanel.tsx',
  // A feature component with one call site, not a shared primitive: the hazard is a hook inside
  // something 24 call sites render. It predates this rule (the M3 brief named only the first two).
  'src/features/navigator/components/HierarchyTree.tsx',
];

function importers(): string[] {
  let out = '';
  try {
    out = execFileSync(
      'grep',
      ['-rlE', '--include=*.ts', '--include=*.tsx', "from '@tanstack/react-virtual'", 'src'],
      { encoding: 'utf8' },
    );
  } catch {
    out = '';
  }
  return out
    .split('\n')
    .filter((file) => file !== '' && !/\.test\.tsx?$/.test(file))
    .sort();
}

describe('useVirtualizer import sites', () => {
  it('are the windowed table body, the Gantt panel and the navigator tree only', () => {
    expect(importers()).toEqual([...ALLOWED].sort());
  });

  it('keeps DataTable itself free of the hook', () => {
    expect(importers()).not.toContain('src/components/ui/data-table.tsx');
  });
});
